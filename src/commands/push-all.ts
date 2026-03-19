import type { Command } from "commander";
import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import pc from "picocolors";
import { showIntro, showOutro, askConfirm, withSpinner, log } from "../ui/index.js";
import { resolveVault } from "../core/config.js";
import { PROJECT_MARKERS, scanEnvFiles } from "../core/project.js";
import {
  detectVaultLayout,
  ensureGitattributes,
  copyEnvFilesToVault,
  getProjectDir,
  fileExists,
  filesMatch,
  listVaultFiles,
} from "../core/vault.js";
import * as git from "../core/git.js";
import { withErrorHandling } from "../utils/errors.js";

interface DiscoveredProject {
  name: string;
  rootPath: string;
  envFiles: string[];
}

type FileStatus = "new" | "modified" | "in-sync";

interface ProjectSyncPlan {
  name: string;
  rootPath: string;
  envFiles: string[];
  status: FileStatus;
  outOfSyncFiles: string[];
}

async function discoverProjects(rootDir: string): Promise<DiscoveredProject[]> {
  const resolved = resolve(rootDir);
  const entries = await readdir(resolved, { withFileTypes: true });
  const projects: DiscoveredProject[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const dirPath = join(resolved, entry.name);

    let isProject = false;
    for (const marker of PROJECT_MARKERS) {
      try {
        await stat(join(dirPath, marker));
        isProject = true;
        break;
      } catch {
        // marker not found
      }
    }

    if (!isProject) continue;

    const NON_SECRET_PATTERNS = [".env.example", ".env.sample", ".env.template"];
    const allEnvFiles = await scanEnvFiles(dirPath);
    const envFiles = allEnvFiles.filter(
      (f) => !NON_SECRET_PATTERNS.includes(basename(f)),
    );
    if (envFiles.length === 0) continue;

    projects.push({
      name: entry.name,
      rootPath: dirPath,
      envFiles,
    });
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

async function computeSyncPlan(
  projects: DiscoveredProject[],
  vaultPath: string,
): Promise<ProjectSyncPlan[]> {
  const plans: ProjectSyncPlan[] = [];

  for (const project of projects) {
    const outOfSyncFiles: string[] = [];

    // Check if this project already exists in the vault
    const projectDir = getProjectDir(vaultPath, project.name);
    const projectExistsInVault = await fileExists(projectDir);

    if (projectExistsInVault) {
      // Existing project: only compare files already tracked in the vault
      const vaultFiles = await listVaultFiles(vaultPath, project.name);

      for (const file of vaultFiles) {
        const localFile = join(project.rootPath, file);
        const localExists = await fileExists(localFile);

        if (!localExists) {
          // File in vault but deleted locally — skip, don't push a deletion
          continue;
        }

        const vaultFile = join(projectDir, file);
        const match = await filesMatch(localFile, vaultFile);
        if (!match) {
          outOfSyncFiles.push(file);
        }
      }
    } else {
      // New project: all local env files are candidates
      outOfSyncFiles.push(...project.envFiles);
    }

    let status: FileStatus;
    if (outOfSyncFiles.length === 0) {
      status = "in-sync";
    } else if (!projectExistsInVault) {
      status = "new";
    } else {
      status = "modified";
    }

    plans.push({
      name: project.name,
      rootPath: project.rootPath,
      envFiles: project.envFiles,
      status,
      outOfSyncFiles,
    });
  }

  return plans;
}

export function registerPushAllCommand(program: Command): void {
  program
    .command("push-all")
    .description("Push env files from all projects under a directory")
    .argument("[dir]", "Root directory containing projects (default: cwd)")
    .option("-m, --message <msg>", "Custom commit message")
    .option("--vault <name>", "Use a specific vault")
    .option("--dry-run", "Preview what would be pushed without pushing")
    .action(withErrorHandling(async (dir: string | undefined, opts: { message?: string; vault?: string; dryRun?: boolean }) => {
      showIntro();

      // 1. Resolve root directory
      const rootDir = resolve(dir ?? process.cwd());

      // 2. Resolve vault (no project name for push-all)
      const vault = await resolveVault({ vaultName: opts.vault });
      log.info(`Using vault: ${pc.bold(vault.name)}`);

      // 3. Reject legacy layout
      const layout = await detectVaultLayout(vault.vaultPath);
      if (layout === "legacy") {
        log.error("Your vault uses the old layout. Run 'sheltr migrate' to update.");
        showOutro("Push cancelled.");
        return;
      }

      // 4. Discover projects
      const projects = await withSpinner({
        start: "Scanning for projects...",
        stop: "Scan complete.",
        task: () => discoverProjects(rootDir),
      });

      if (projects.length === 0) {
        log.warn("No projects with .env files found.");
        showOutro("Nothing to push.");
        return;
      }

      // 5. Pull vault once
      if (await git.hasCommits(vault.vaultPath)) {
        await withSpinner({
          start: "Pulling latest vault...",
          stop: "Vault up to date.",
          task: () => git.pull(vault.vaultPath),
        });
      }

      // 6. Compute sync plan
      const plans = await computeSyncPlan(projects, vault.vaultPath);
      const actionable = plans.filter((p) => p.status !== "in-sync");

      // 7. Display summary table
      log.plain("");
      log.plain(`  ${pc.bold("Project")}${" ".repeat(24)}${"Files"}  ${"Status"}`);
      log.plain(`  ${"─".repeat(50)}`);

      for (const plan of plans) {
        const name = plan.name.padEnd(30);
        const count = String(plan.outOfSyncFiles.length).padStart(5);
        let status: string;
        if (plan.status === "in-sync") {
          status = pc.green("in sync");
        } else if (plan.status === "new") {
          status = pc.yellow("new");
        } else {
          status = pc.yellow("modified");
        }
        log.plain(`  ${name} ${count}  ${status}`);

        if (plan.outOfSyncFiles.length > 0) {
          for (const file of plan.outOfSyncFiles) {
            log.plain(`    ${pc.dim(file)}`);
          }
        }
      }

      log.plain("");

      if (actionable.length === 0) {
        log.info("All projects are in sync. Nothing to push.");
        showOutro();
        return;
      }

      const totalFiles = actionable.reduce((sum, p) => sum + p.outOfSyncFiles.length, 0);
      log.plain(`  ${pc.bold(String(totalFiles))} file(s) across ${pc.bold(String(actionable.length))} project(s) to push.`);

      // 8. Dry run exit
      if (opts.dryRun) {
        showOutro("Dry run complete.");
        return;
      }

      // 9. Confirm
      const confirmed = await askConfirm({
        message: `Push ${totalFiles} file(s) across ${actionable.length} project(s) to vault "${vault.name}"?`,
      });

      if (!confirmed) {
        showOutro("Push cancelled.");
        return;
      }

      // 10. Execute
      const result = await withSpinner({
        start: "Pushing to vault...",
        stop: "Done!",
        task: async () => {
          const vaultPath = vault.vaultPath;
          const filesToStage: string[] = [];

          // Ensure .gitattributes
          const gitattrsCreated = await ensureGitattributes(vaultPath);
          if (gitattrsCreated) {
            filesToStage.push(".gitattributes");
          }

          // Copy env files for each actionable project
          for (const plan of actionable) {
            const copiedPaths = await copyEnvFilesToVault(
              plan.rootPath,
              plan.name,
              vaultPath,
              plan.outOfSyncFiles,
            );
            filesToStage.push(...copiedPaths);
          }

          // Single git add/commit/push
          await git.add(vaultPath, filesToStage);

          if (!(await git.hasStagedChanges(vaultPath))) {
            return "no-changes";
          }

          const projectNames = actionable.map((p) => p.name).join(", ");
          const commitMessage =
            opts.message ?? `sheltr: push-all ${projectNames} ${new Date().toISOString().slice(0, 19)}`;
          await git.commit(vaultPath, commitMessage);
          await git.push(vaultPath);
          return "pushed";
        },
      });

      // 11. Show result
      if (result === "no-changes") {
        log.info("Files are already up to date in the vault. Nothing to push.");
      } else {
        log.info(`Pushed ${pc.bold(String(totalFiles))} file(s) across ${pc.bold(String(actionable.length))} project(s).`);
      }

      showOutro();
    }));
}
