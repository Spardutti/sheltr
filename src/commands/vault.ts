import type { Command } from "commander";
import { rm } from "node:fs/promises";
import pc from "picocolors";
import { showIntro, showOutro, askText, askSelect, askConfirm, log } from "../ui/index.js";
import { readConfig, writeConfig, getVaultDir } from "../core/config.js";
import { SheltrError, withErrorHandling } from "../utils/errors.js";

export function registerVaultCommand(program: Command): void {
  const vault = program
    .command("vault")
    .description("Manage configured vaults");

  vault
    .command("list")
    .description("List all configured vaults")
    .action(withErrorHandling(async () => {
      showIntro();

      const config = await readConfig();

      if (config.vaults.length === 0) {
        log.info("No vaults configured. Run `sheltr setup` to add one.");
        showOutro();
        return;
      }

      log.info(`${config.vaults.length} vault(s) configured:\n`);
      for (const v of config.vaults) {
        console.log(`  ${pc.bold(v.name)}  ${pc.dim(v.repoUrl)}`);
      }

      console.log();
      showOutro();
    }));

  vault
    .command("remove")
    .description("Remove a configured vault")
    .argument("[name]", "Vault name to remove")
    .action(withErrorHandling(async (nameArg?: string) => {
      showIntro();

      const config = await readConfig();

      if (config.vaults.length === 0) {
        throw new SheltrError("No vaults configured.", "NO_VAULTS");
      }

      let vaultName: string;

      if (nameArg) {
        if (!config.vaults.find((v) => v.name === nameArg)) {
          throw new SheltrError(
            `Vault "${nameArg}" not found. Run \`sheltr vault list\` to see configured vaults.`,
            "VAULT_NOT_FOUND",
          );
        }
        vaultName = nameArg;
      } else {
        vaultName = await askSelect({
          message: "Select a vault to remove:",
          options: config.vaults.map((v) => ({
            value: v.name,
            label: `${v.name} (${v.repoUrl})`,
          })),
        });
      }

      const confirmation = await askText({
        message: `Type "${vaultName}" to confirm removal:`,
        validate(value) {
          if (value !== vaultName) return `Type "${vaultName}" exactly to confirm.`;
        },
      });
      void confirmation;

      const deleteFiles = await askConfirm({
        message: "Also delete the local vault directory and key?",
        initialValue: false,
      });

      if (deleteFiles) {
        log.warn(
          pc.bold("Warning:") + " Deleting the key is permanent.\n" +
          "  If you haven't backed it up, you will lose access to all encrypted data in this vault.",
        );

        const reallyDelete = await askConfirm({
          message: "Are you sure you want to delete the local files?",
          initialValue: false,
        });

        if (reallyDelete) {
          const dir = getVaultDir(vaultName);
          await rm(dir, { recursive: true, force: true });
        }
      }

      config.vaults = config.vaults.filter((v) => v.name !== vaultName);
      await writeConfig(config);

      log.success(`Vault "${vaultName}" removed.`);
      showOutro();
    }));
}
