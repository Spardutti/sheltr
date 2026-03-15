import type { Command } from "commander";
import { basename } from "node:path";
import { access, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { showIntro, showOutro, askSelect, askMultiselect, askConfirm, withSpinner, log } from "../ui/index.js";
import { readConfig } from "../core/config.js";
import { detectProject } from "../core/project.js";
import { listVaultProjects, listVaultFiles, copyFilesFromVault } from "../core/vault.js";
import * as git from "../core/git.js";
import { SheltrError, withErrorHandling } from "../utils/errors.js";

export function registerPullCommand(program: Command): void {
  program
    .command("pull [project]")
    .description("Pull and restore env files from the vault")
    .action(withErrorHandling(async (projectArg?: string) => {
      showIntro();

      const config = await readConfig();
      const vaultPath = config.vaultPath;

      // 1. Validate vault exists
      if (!(await git.isVaultCloned(vaultPath))) {
        throw new SheltrError("Vault not found. Run `sheltr setup` first.", "VAULT_NOT_FOUND");
      }

      // 2. Pull latest from vault
      if (await git.hasCommits(vaultPath)) {
        await git.pull(vaultPath);
      }

      // 3. Resolve project name
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

      // 4. Check project exists in vault
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

      // 5. List vault files for project
      const vaultFiles = await listVaultFiles(vaultPath, projectName);

      if (vaultFiles.length === 0) {
        log.warn("No env files found in vault for this project.");
        showOutro("Nothing to pull.");
        return;
      }

      // 6. User picks files
      const selected = await askMultiselect({
        message: "Select files to restore:",
        options: vaultFiles.map((f) => ({ value: f, label: f })),
        required: true,
      });

      // 7. Conflict detection per file
      const actions = new Map<string, "overwrite" | "backup" | "skip">();

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
          const action = await askSelect({
            message: `"${file}" already exists locally. How to resolve?`,
            options: [
              { value: "overwrite", label: "Overwrite local file" },
              { value: "backup", label: "Backup local, then overwrite" },
              { value: "skip", label: "Skip this file" },
            ],
          });
          actions.set(file, action as "overwrite" | "backup" | "skip");
        } else {
          actions.set(file, "overwrite");
        }
      }

      // Filter out skipped files
      const filesToRestore = selected.filter((f) => actions.get(f) !== "skip");

      if (filesToRestore.length === 0) {
        showOutro("All files skipped.");
        return;
      }

      // 8. Restore files
      await withSpinner({
        start: `Restoring ${filesToRestore.length} file(s)...`,
        stop: "Files restored!",
        task: async () => {
          // Create backups first
          for (const file of filesToRestore) {
            if (actions.get(file) === "backup") {
              const localPath = join(cwd, file);
              await copyFile(localPath, localPath + ".backup");
            }
          }

          // Copy from vault
          await copyFilesFromVault(vaultPath, projectName, cwd, filesToRestore);
        },
      });

      showOutro("Pull complete!");
    }));
}
