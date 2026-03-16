import type { Command } from "commander";
import { basename } from "node:path";
import pc from "picocolors";
import { showIntro, showOutro, withSpinner, log } from "../ui/index.js";
import { readConfig } from "../core/config.js";
import { detectProject } from "../core/project.js";
import { listVaultProjects, listVaultFiles } from "../core/vault.js";
import * as git from "../core/git.js";
import { SheltrError, withErrorHandling } from "../utils/errors.js";

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List stored projects")
    .action(withErrorHandling(async () => {
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
        log.info("No projects stored yet. Run `sheltr push` to get started.");
        showOutro();
        return;
      }

      // Detect current project to highlight it in the list
      const cwd = process.cwd();
      const detected = await detectProject(cwd);
      const currentName = detected?.name ?? basename(cwd);
      const inVault = projects.includes(currentName);

      if (inVault) {
        log.info(`Current project: ${pc.bold(currentName)} ${pc.green("(in vault)")}\n`);
      } else {
        log.info(`Current project: ${pc.bold(currentName)} ${pc.yellow("(not in vault)")}\n`);
      }

      for (const project of projects) {
        const files = await listVaultFiles(vaultPath, project);
        const marker = project === currentName ? pc.green(" ←") : "";
        console.log(`  ${pc.bold(project)} ${pc.dim(`(${files.length} file${files.length === 1 ? "" : "s"})`)}${marker}`);
        for (const file of files) {
          console.log(`    ${pc.dim(file)}`);
        }
      }

      console.log();
      showOutro();
    }));
}
