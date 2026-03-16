import type { Command } from "commander";
import { basename } from "node:path";
import { showIntro, showOutro, askText, askSelect, withSpinner, log } from "../ui/index.js";
import { readConfig } from "../core/config.js";
import { detectProject } from "../core/project.js";
import { listVaultProjects, listVaultFiles, removeVaultProject } from "../core/vault.js";
import * as git from "../core/git.js";
import { SheltrError, withErrorHandling } from "../utils/errors.js";

export function registerDeleteCommand(program: Command): void {
  program
    .command("delete")
    .description("Delete a stored project")
    .argument("[project]", "Project name to delete")
    .action(withErrorHandling(async (projectArg?: string) => {
      showIntro();

      const config = await readConfig();
      const vaultPath = config.vaultPath;

      if (!(await git.isVaultCloned(vaultPath))) {
        throw new SheltrError("Vault not found. Run `sheltr setup` first.", "VAULT_NOT_FOUND");
      }

      if (await git.hasCommits(vaultPath)) {
        await withSpinner({
          start: "Syncing vault...",
          stop: "Vault synced!",
          task: () => git.pull(vaultPath),
        });
      }

      const projects = await listVaultProjects(vaultPath);

      if (projects.length === 0) {
        throw new SheltrError("Nothing to delete. The vault is empty.", "VAULT_EMPTY");
      }

      // Resolve project name
      let projectName: string;

      if (projectArg) {
        if (!projects.includes(projectArg)) {
          throw new SheltrError(
            `Project "${projectArg}" not found in vault. Run \`sheltr list\` to see stored projects.`,
            "PROJECT_NOT_FOUND",
          );
        }
        projectName = projectArg;
      } else {
        // Try to detect from cwd
        const cwd = process.cwd();
        const detected = await detectProject(cwd);
        const candidateName = detected?.name ?? basename(cwd);

        if (projects.includes(candidateName)) {
          projectName = candidateName;
        } else {
          projectName = await askSelect({
            message: "Select a project to delete:",
            options: projects.map((p) => ({ value: p, label: p })),
          });
        }
      }

      // Show files that will be deleted
      const files = await listVaultFiles(vaultPath, projectName);
      log.warn(`This will permanently delete all stored env files for "${projectName}":`);
      for (const file of files) {
        console.log(`  ${file}`);
      }
      console.log();

      // Typed confirmation
      const confirmation = await askText({
        message: `Type "${projectName}" to confirm deletion:`,
        validate(value) {
          if (value !== projectName) {
            return `Please type "${projectName}" exactly to confirm.`;
          }
        },
      });

      void confirmation;

      await withSpinner({
        start: "Deleting from vault...",
        stop: "Project deleted!",
        task: async () => {
          await git.rm(vaultPath, [projectName], true);
          await removeVaultProject(vaultPath, projectName);
          await git.commit(vaultPath, `sheltr: delete ${projectName}`);
          await git.push(vaultPath);
        },
      });

      showOutro();
    }));
}
