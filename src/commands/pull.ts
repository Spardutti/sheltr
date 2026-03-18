import type { Command } from "commander";
import { basename } from "node:path";
import { access, copyFile } from "node:fs/promises";
import { join } from "node:path";
import pc from "picocolors";
import { showIntro, showOutro, askSelect, askMultiselect, askConfirm, withSpinner, log } from "../ui/index.js";
import { resolveVault } from "../core/config.js";
import { detectProject } from "../core/project.js";
import { listVaultProjects, listVaultFiles, copyFilesFromVault, detectVaultLayout } from "../core/vault.js";
import * as git from "../core/git.js";
import { SheltrError, withErrorHandling } from "../utils/errors.js";

export function registerPullCommand(program: Command): void {
  program
    .command("pull [project]")
    .description("Pull and restore env files from the vault")
    .option("--vault <name>", "Use a specific vault")
    .action(withErrorHandling(async (projectArg: string | undefined, opts: { vault?: string }) => {
      showIntro();

      // 1. Resolve project name first (needed for vault inference)
      const cwd = process.cwd();
      let projectName: string;

      if (projectArg) {
        projectName = projectArg;
      } else {
        const project = await detectProject(cwd);
        if (project) {
          log.info(`Detected project: ${project.name}`);
          projectName = project.name;
        } else {
          const folderName = basename(cwd);
          const useFolder = await askConfirm({
            message: `No project detected. Use current folder name "${folderName}"?`,
          });
          if (!useFolder) {
            showOutro("Pull cancelled.");
            return;
          }
          projectName = folderName;
        }
      }

      // 2. Resolve vault (infers from project name)
      const vault = await resolveVault({ vaultName: opts.vault, projectName });
      const vaultPath = vault.vaultPath;

      log.info(`Using vault: ${pc.bold(vault.name)}`);

      // 3. Validate vault exists
      if (!(await git.isVaultCloned(vaultPath))) {
        throw new SheltrError("Vault not found. Run `sheltr setup` first.", "VAULT_NOT_FOUND");
      }

      // 4. Pull latest from vault
      if (await git.hasCommits(vaultPath)) {
        await withSpinner({
          start: "Syncing vault...",
          stop: "Vault synced!",
          task: () => git.pull(vaultPath),
        });
      }

      // Check for legacy layout — allow pull but warn
      const layout = await detectVaultLayout(vaultPath);
      if (layout === "legacy") {
        log.warn("Your vault uses the old layout. Run 'sheltr migrate' to update.");
      }

      // 5. Check project exists in vault
      const vaultProjects = await listVaultProjects(vaultPath);

      if (!vaultProjects.includes(projectName)) {
        if (vaultProjects.length === 0) {
          throw new SheltrError("Vault is empty. Push some files first.", "VAULT_EMPTY");
        }

        log.warn(`Project "${projectName}" not found in vault.`);
        projectName = await askSelect({
          message: "Select a project from the vault:",
          options: vaultProjects.map((p) => ({ value: p, label: p })),
        });
      }

      // 6. List vault files for project
      const vaultFiles = await listVaultFiles(vaultPath, projectName);

      if (vaultFiles.length === 0) {
        log.warn("No env files found in vault for this project.");
        showOutro("Nothing to pull.");
        return;
      }

      // 7. User picks files
      const selected = await askMultiselect({
        message: "Select files to restore:",
        options: vaultFiles.map((f) => ({ value: f, label: f })),
        required: true,
      });

      // 8. Conflict detection — auto-backup existing files, let user skip
      const filesToRestore: string[] = [];
      const filesToBackup: string[] = [];

      for (const file of selected) {
        const localPath = join(cwd, file);
        let exists = false;
        try {
          await access(localPath);
          exists = true;
        } catch {
          // File doesn't exist locally
        }

        if (exists) {
          const overwrite = await askConfirm({
            message: `"${file}" already exists locally. Overwrite? (backup will be created)`,
          });
          if (overwrite) {
            filesToRestore.push(file);
            filesToBackup.push(file);
          }
        } else {
          filesToRestore.push(file);
        }
      }

      if (filesToRestore.length === 0) {
        showOutro("All files skipped.");
        return;
      }

      // 9. Restore files
      await withSpinner({
        start: `Restoring ${filesToRestore.length} file(s)...`,
        stop: "Files restored!",
        task: async () => {
          // Auto-backup existing files before overwriting
          for (const file of filesToBackup) {
            const localPath = join(cwd, file);
            await copyFile(localPath, localPath + ".backup");
          }

          // Copy from vault
          await copyFilesFromVault(vaultPath, projectName, cwd, filesToRestore);
        },
      });

      if (filesToBackup.length > 0) {
        log.info(`Backups created: ${filesToBackup.map((f) => f + ".backup").join(", ")}`);
      }

      showOutro();
    }));
}
