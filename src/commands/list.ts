import type { Command } from "commander";
import pc from "picocolors";
import { showIntro, showOutro, log } from "../ui/index.js";
import { readConfig } from "../core/config.js";
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
        await git.pull(vaultPath);
      }

      const projects = await listVaultProjects(vaultPath);

      if (projects.length === 0) {
        log.info("No projects stored yet. Run `sheltr push` to get started.");
        showOutro();
        return;
      }

      for (const project of projects) {
        const files = await listVaultFiles(vaultPath, project);
        console.log(`  ${pc.bold(project)} ${pc.dim(`(${files.length} file${files.length === 1 ? "" : "s"})`)}`);
        for (const file of files) {
          console.log(`    ${pc.dim(file)}`);
        }
      }

      console.log();
      showOutro();
    }));
}
