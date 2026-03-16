import type { Command } from "commander";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { showIntro, showOutro, askConfirm, log } from "../ui/index.js";
import { readConfig } from "../core/config.js";
import { fileExists } from "../core/vault.js";
import { SheltrError, withErrorHandling } from "../utils/errors.js";

export function registerKeyCommand(program: Command): void {
  const key = program
    .command("key")
    .description("Manage your encryption key");

  key
    .command("export")
    .description("Export your key as base64 (for password manager backup)")
    .action(withErrorHandling(async () => {
      showIntro();

      const config = await readConfig();

      if (!(await fileExists(config.keyPath))) {
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

      const keyBuffer = await readFile(config.keyPath);
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
    .action(withErrorHandling(async (base64: string) => {
      showIntro();

      const config = await readConfig();

      // Validate base64 input
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) {
        throw new SheltrError("Invalid base64 string.", "INVALID_KEY");
      }

      // Check if key already exists
      if (await fileExists(config.keyPath)) {
        throw new SheltrError(
          "Key file already exists. Delete it manually if you want to replace it:\n" +
          `  rm ${config.keyPath}`,
          "KEY_EXISTS",
        );
      }

      await writeFile(config.keyPath, buffer);
      await chmod(config.keyPath, 0o400);

      log.success(`Key saved to ${config.keyPath}`);
      showOutro();
    }));
}
