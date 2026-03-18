import type { Command } from "commander";
import pc from "picocolors";
import { showIntro, showOutro, withSpinner, log } from "../ui/index.js";
import { readConfig, type VaultEntry } from "../core/config.js";
import { detectVaultLayout, migrateVaultLayout } from "../core/vault.js";
import * as git from "../core/git.js";
import { SheltrError, withErrorHandling } from "../utils/errors.js";

export function registerMigrateCommand(program: Command): void {
  program
    .command("migrate")
    .description("Migrate vault(s) to the new _env/ layout")
    .option("--vault <name>", "Migrate a specific vault")
    .action(withErrorHandling(async (opts: { vault?: string }) => {
      showIntro();

      const config = await readConfig();

      let vaults: VaultEntry[];
      if (opts.vault) {
        const found = config.vaults.find((v) => v.name === opts.vault);
        if (!found) {
          throw new SheltrError(`Vault "${opts.vault}" not found.`, "VAULT_NOT_FOUND");
        }
        vaults = [found];
      } else {
        vaults = config.vaults;
      }

      if (vaults.length === 0) {
        throw new SheltrError("No vaults configured. Run `sheltr setup` first.", "NO_VAULTS");
      }

      let migratedCount = 0;

      for (const vault of vaults) {
        const vaultPath = vault.vaultPath;

        if (!(await git.isVaultCloned(vaultPath))) {
          log.warn(`Vault "${vault.name}" is not cloned — skipping.`);
          continue;
        }

        const layout = await detectVaultLayout(vaultPath);

        if (layout === "modern") {
          log.info(`${pc.bold(vault.name)}: already using modern layout — skipping.`);
          continue;
        }

        const result = await withSpinner({
          start: `Migrating ${vault.name}...`,
          stop: `${vault.name} migrated!`,
          task: async () => {
            if (await git.hasCommits(vaultPath)) {
              await git.pull(vaultPath);
            }

            const migrated = await migrateVaultLayout(vaultPath);

            // Stage and commit
            await git.add(vaultPath, ["."]);
            await git.commit(vaultPath, "sheltr: migrate to _env/ layout");
            await git.push(vaultPath);

            return migrated;
          },
        });

        log.info(`Migrated ${result.migrated.length} project(s): ${result.migrated.join(", ")}`);
        migratedCount++;
      }

      if (migratedCount === 0) {
        log.info("All vaults already use the modern layout.");
      }

      showOutro();
    }));
}
