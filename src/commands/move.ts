import type { Command } from "commander";
import { join } from "node:path";
import pc from "picocolors";
import { showIntro, showOutro, askSelect, askConfirm, withSpinner, log } from "../ui/index.js";
import { readConfig } from "../core/config.js";
import {
  listVaultProjects,
  listVaultFiles,
  copyEnvFilesToVault,
  ensureGitattributes,
  removeVaultProject,
} from "../core/vault.js";
import * as git from "../core/git.js";
import { SheltrError, withErrorHandling } from "../utils/errors.js";

export function registerMoveCommand(program: Command): void {
  program
    .command("move [project]")
    .description("Move a project from one vault to another")
    .option("--from <name>", "Source vault name")
    .option("--to <name>", "Destination vault name")
    .action(withErrorHandling(async (projectArg: string | undefined, opts: { from?: string; to?: string }) => {
      showIntro();

      const config = await readConfig();

      if (config.vaults.length < 2) {
        throw new SheltrError(
          "You need at least 2 vaults to move a project. Run `sheltr setup` to add another.",
          "INSUFFICIENT_VAULTS",
        );
      }

      const vaultOptions = config.vaults.map((v) => ({
        value: v.name,
        label: `${v.name} (${v.repoUrl})`,
      }));

      // Resolve source vault
      let sourceName: string;
      if (opts.from) {
        if (!config.vaults.find((v) => v.name === opts.from)) {
          throw new SheltrError(`Vault "${opts.from}" not found.`, "VAULT_NOT_FOUND");
        }
        sourceName = opts.from;
      } else {
        sourceName = await askSelect({
          message: "Move from which vault?",
          options: vaultOptions,
        });
      }

      const sourceVault = config.vaults.find((v) => v.name === sourceName)!;

      if (!(await git.isVaultCloned(sourceVault.vaultPath))) {
        throw new SheltrError(`Vault "${sourceName}" is not cloned.`, "VAULT_NOT_FOUND");
      }

      // Sync source vault
      if (await git.hasCommits(sourceVault.vaultPath)) {
        await withSpinner({
          start: `Syncing ${sourceName}...`,
          stop: `${sourceName} synced!`,
          task: () => git.pull(sourceVault.vaultPath),
        });
      }

      // Resolve project
      const projects = await listVaultProjects(sourceVault.vaultPath);
      if (projects.length === 0) {
        throw new SheltrError(`Vault "${sourceName}" is empty.`, "VAULT_EMPTY");
      }

      let projectName: string;
      if (projectArg) {
        if (!projects.includes(projectArg)) {
          throw new SheltrError(
            `Project "${projectArg}" not found in vault "${sourceName}".`,
            "PROJECT_NOT_FOUND",
          );
        }
        projectName = projectArg;
      } else {
        projectName = await askSelect({
          message: "Select a project to move:",
          options: projects.map((p) => ({ value: p, label: p })),
        });
      }

      // Resolve destination vault
      let destName: string;
      if (opts.to) {
        if (!config.vaults.find((v) => v.name === opts.to)) {
          throw new SheltrError(`Vault "${opts.to}" not found.`, "VAULT_NOT_FOUND");
        }
        if (opts.to === sourceName) {
          throw new SheltrError("Source and destination vaults are the same.", "SAME_VAULT");
        }
        destName = opts.to;
      } else {
        const destOptions = vaultOptions.filter((v) => v.value !== sourceName);
        destName = await askSelect({
          message: "Move to which vault?",
          options: destOptions,
        });
      }

      const destVault = config.vaults.find((v) => v.name === destName)!;

      if (!(await git.isVaultCloned(destVault.vaultPath))) {
        throw new SheltrError(`Vault "${destName}" is not cloned.`, "VAULT_NOT_FOUND");
      }

      // Show what will happen
      const files = await listVaultFiles(sourceVault.vaultPath, projectName);
      console.log();
      log.info(`Moving "${pc.bold(projectName)}":`);
      log.info(`  ${pc.bold(sourceName)} → ${pc.bold(destName)}\n`);
      log.info("Files:");
      for (const file of files) {
        console.log(`  ${pc.dim(file)}`);
      }
      console.log();

      const confirmed = await askConfirm({
        message: "Proceed with move?",
      });

      if (!confirmed) {
        showOutro("Move cancelled.");
        return;
      }

      await withSpinner({
        start: "Moving project...",
        stop: "Project moved!",
        task: async () => {
          // Sync destination
          if (await git.hasCommits(destVault.vaultPath)) {
            await git.pull(destVault.vaultPath);
          }

          // Copy files from source vault to destination vault
          const sourceProjectDir = join(sourceVault.vaultPath, projectName);

          const copiedPaths = await copyEnvFilesToVault(
            sourceProjectDir,
            projectName,
            destVault.vaultPath,
            files,
          );

          // Ensure .gitattributes in dest
          const filesToStage = [...copiedPaths];
          const gitattrsCreated = await ensureGitattributes(destVault.vaultPath);
          if (gitattrsCreated) {
            filesToStage.push(".gitattributes");
          }

          // Commit to destination
          await git.add(destVault.vaultPath, filesToStage);
          await git.commit(destVault.vaultPath, `sheltr: move ${projectName} from ${sourceName}`);
          await git.push(destVault.vaultPath);

          // Remove from source
          await git.rm(sourceVault.vaultPath, [projectName], true);
          await removeVaultProject(sourceVault.vaultPath, projectName);
          await git.commit(sourceVault.vaultPath, `sheltr: move ${projectName} to ${destName}`);
          await git.push(sourceVault.vaultPath);
        },
      });

      showOutro();
    }));
}
