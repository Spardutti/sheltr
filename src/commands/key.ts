import type { Command } from "commander";
import { readFile, writeFile, chmod, mkdir } from "node:fs/promises";
import pc from "picocolors";
import { showIntro, showOutro, askConfirm, log } from "../ui/index.js";
import { resolveVault, configExists, getSheltrDir } from "../core/config.js";
import { fileExists } from "../core/vault.js";
import { join } from "node:path";
import { SheltrError, withErrorHandling } from "../utils/errors.js";

export function registerKeyCommand(program: Command): void {
  const key = program
    .command("key")
    .description("Manage your encryption key");

  key
    .command("export")
    .description("Export your key as base64 (for password manager backup)")
    .option("--vault <name>", "Use a specific vault")
    .action(withErrorHandling(async (opts: { vault?: string }) => {
      showIntro();

      const vault = await resolveVault({ vaultName: opts.vault });

      log.info(`Using vault: ${pc.bold(vault.name)}`);

      if (!(await fileExists(vault.keyPath))) {
        throw new SheltrError("Key file not found. Run `sheltr setup` first.", "KEY_NOT_FOUND");
      }

      log.warn("This will display your encryption key in the terminal.\n  Anyone who sees it can decrypt your entire vault.");
      const proceed = await askConfirm({
        message: "Show key?",
        initialValue: false,
      });

      if (!proceed) {
        showOutro("Export cancelled.");
        return;
      }

      const keyBuffer = await readFile(vault.keyPath);
      const base64 = keyBuffer.toString("base64");

      log.info("Copy this base64 string to your password manager:\n");
      console.log(`  ${base64}`);
      console.log();
      log.warn("Anyone with this string can decrypt your vault. Keep it secret.");

      showOutro();
    }));

  key
    .command("import")
    .description("Import a key from a base64 string")
    .argument("<base64>", "Base64-encoded key string")
    .option("--vault <name>", "Use a specific vault")
    .action(withErrorHandling(async (base64: string, opts: { vault?: string }) => {
      showIntro();

      // Validate base64 input
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) {
        throw new SheltrError("Invalid base64 string.", "INVALID_KEY");
      }

      let keyPath: string;

      const hasConfig = await configExists();

      if (hasConfig) {
        const vault = await resolveVault({ vaultName: opts.vault });
        log.info(`Using vault: ${pc.bold(vault.name)}`);
        keyPath = vault.keyPath;
      } else {
        // No config yet — save to staging location
        const sheltrDir = getSheltrDir();
        await mkdir(sheltrDir, { recursive: true });
        await chmod(sheltrDir, 0o700);
        keyPath = join(sheltrDir, "key");
      }

      // Check if key already exists
      if (await fileExists(keyPath)) {
        throw new SheltrError(
          "Key file already exists. Delete it manually if you want to replace it:\n" +
          `  rm ${keyPath}`,
          "KEY_EXISTS",
        );
      }

      await writeFile(keyPath, buffer);
      await chmod(keyPath, 0o400);

      log.success(`Key saved to ${keyPath}`);

      if (!hasConfig) {
        log.info(`Run ${pc.bold("sheltr setup")} and choose "Import an existing key" to finish configuration.`);
      }

      showOutro();
    }));
}
