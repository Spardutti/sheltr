import type { Command } from "commander";
import { basename } from "node:path";
import pc from "picocolors";
import { showIntro, showOutro, withSpinner, log } from "../ui/index.js";
import { readConfig } from "../core/config.js";
import { detectProject } from "../core/project.js";
import { listVaultProjects, listVaultFiles } from "../core/vault.js";
import * as git from "../core/git.js";
import { withErrorHandling } from "../utils/errors.js";

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List stored projects")
    .action(withErrorHandling(async () => {
      showIntro();

      const config = await readConfig();

      if (config.vaults.length === 0) {
        log.info("No vaults configured. Run `sheltr setup` to get started.");
        showOutro();
        return;
      }

      // Detect current project to highlight it
      const cwd = process.cwd();
      const detected = await detectProject(cwd);
      const currentName = detected?.name ?? basename(cwd);

      let totalProjects = 0;

      for (const vault of config.vaults) {
        if (!(await git.isVaultCloned(vault.vaultPath))) {
          log.warn(`Vault "${vault.name}" is not cloned. Run \`sheltr setup\` to fix.`);
          continue;
        }

        if (await git.hasCommits(vault.vaultPath)) {
          await withSpinner({
            start: `Syncing ${vault.name}...`,
            stop: `${vault.name} synced!`,
            task: () => git.pull(vault.vaultPath),
          });
        }

        const projects = await listVaultProjects(vault.vaultPath);
        totalProjects += projects.length;

        // Show vault header (only when multiple vaults)
        if (config.vaults.length > 1) {
          console.log(`\n  ${pc.bold(pc.cyan(vault.name))}  ${pc.dim(vault.repoUrl)}`);
        }

        if (projects.length === 0) {
          console.log(`  ${pc.dim("  (empty)")}`);
          continue;
        }

        for (const project of projects) {
          const files = await listVaultFiles(vault.vaultPath, project);
          const marker = project === currentName ? pc.green(" ←") : "";
          const indent = config.vaults.length > 1 ? "    " : "  ";
          console.log(`${indent}${pc.bold(project)} ${pc.dim(`(${files.length} file${files.length === 1 ? "" : "s"})`)}${marker}`);
          for (const file of files) {
            console.log(`${indent}  ${pc.dim(file)}`);
          }
        }
      }

      if (totalProjects === 0) {
        log.info("No projects stored yet. Run `sheltr push` to get started.");
      }

      console.log();
      showOutro();
    }));
}
