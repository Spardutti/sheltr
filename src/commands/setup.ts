import type { Command } from "commander";
import pc from "picocolors";
import { showIntro, showOutro, askText, askSelect, withSpinner, log } from "../ui/index.js";
import {
  configExists,
  readConfig,
  writeConfig,
  getDefaultVaultPathForName,
  getDefaultKeyPathForName,
  ensureVaultDir,
  type SheltrConfig,
} from "../core/config.js";
import { cloneRepo, isVaultCloned } from "../core/git.js";
import {
  ensureGitCryptInstalled,
  initCrypt,
  exportKey,
  unlockVault,
  importKey,
} from "../core/crypt.js";
import { askConfirm } from "../ui/prompts.js";
import { withErrorHandling } from "../utils/errors.js";

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Configure sheltr for a repository")
    .action(withErrorHandling(async () => {
      showIntro();

      await ensureGitCryptInstalled();

      let config: SheltrConfig = { vaults: [] };
      let existingNames: string[] = [];

      if (await configExists()) {
        config = await readConfig();
        existingNames = config.vaults.map((v) => v.name);

        if (config.vaults.length > 0) {
          log.info("Existing vaults:");
          for (const v of config.vaults) {
            console.log(`  ${pc.bold(v.name)}  ${pc.dim(v.repoUrl)}`);
          }
          console.log();

          const addNew = await askConfirm({
            message: "Add a new vault?",
          });
          if (!addNew) {
            showOutro("Keeping existing configuration.");
            return;
          }
        }
      }

      // --- Onboarding explanation (only on first vault) ---
      if (config.vaults.length === 0) {
        console.log();
        console.log(pc.bold("  How sheltr works:"));
        console.log();
        console.log(`  Sheltr stores your .env files in a ${pc.cyan("separate private Git repo")}`);
        console.log(`  that acts as an encrypted vault. This is ${pc.bold("not")} your project repo —`);
        console.log(`  it's a dedicated repo just for secrets.`);
        console.log();
        console.log(pc.dim("  Example:"));
        console.log(pc.dim("    Your project  → github.com/you/my-app"));
        console.log(pc.dim("    Your vault    → github.com/you/env-vault  (create this one)"));
        console.log();
        console.log(`  ${pc.dim("1.")} Create an ${pc.bold("empty private repo")} on GitHub/GitLab`);
        console.log(`  ${pc.dim("2.")} Paste the ${pc.bold("SSH URL")} below (recommended)`);
        console.log(`  ${pc.dim("3.")} Sheltr encrypts and pushes your .env files there`);
        console.log();
      }

      // --- Step 1: Vault name ---
      log.info(pc.dim("Step 1 of 3") + " — Vault name");

      const vaultName = await askText({
        message: "Give this vault a name:",
        placeholder: config.vaults.length === 0 ? "personal" : "work",
        validate(value) {
          const v = value.trim();
          if (!v) return "Vault name is required.";
          if (!/^[a-zA-Z0-9_-]+$/.test(v)) {
            return "Use only letters, numbers, dashes, and underscores.";
          }
          if (existingNames.includes(v)) {
            return `A vault named "${v}" already exists.`;
          }
        },
      });

      // --- Step 2: Repository ---
      console.log();
      log.info(pc.dim("Step 2 of 3") + " — Vault repository");

      const repoUrl = await askText({
        message: "Paste your vault repo SSH URL:",
        placeholder: "git@github.com:user/env-vault.git",
        validate(value) {
          const v = value.trim();
          if (!v) return "Repository URL is required.";

          const isHttps = /^https:\/\/.+\/.+/.test(v);
          const isSsh = /^git@.+:.+\/.+/.test(v);

          if (!isHttps && !isSsh) {
            return "Enter a valid Git URL (git@github.com:user/repo.git)";
          }

          if (isHttps) {
            return "HTTPS URLs require a credential helper. Use the SSH URL instead (git@github.com:user/repo.git)";
          }
        },
      });

      // Create per-vault directory
      await ensureVaultDir(vaultName);

      const vaultPath = getDefaultVaultPathForName(vaultName);

      // Clone the repo
      const alreadyCloned = await isVaultCloned(vaultPath);
      if (alreadyCloned) {
        log.info("Vault repo already cloned. Skipping clone.");
      } else {
        await withSpinner({
          start: "Cloning repository...",
          stop: "Repository cloned!",
          task: () => cloneRepo(repoUrl, vaultPath),
        });
      }

      // --- Step 3: Encryption key ---
      console.log();
      log.info(pc.dim("Step 3 of 3") + " — Encryption key");

      const keyMethod = await askSelect({
        message: "How would you like to configure your encryption key?",
        options: [
          { value: "generate", label: "Generate a new key — first time setting up this vault" },
          { value: "import", label: "Import an existing key — setting up another machine" },
        ],
      });

      const keyPath = getDefaultKeyPathForName(vaultName);

      if (keyMethod === "generate") {
        await withSpinner({
          start: "Initializing encryption...",
          stop: "Encryption initialized!",
          task: async () => {
            await initCrypt(vaultPath);
            await exportKey(vaultPath, keyPath);
          },
        });

        console.log();
        log.warn(
          pc.bold("IMPORTANT: Back up your encryption key!\n") +
          `  Key saved to: ${pc.underline(keyPath)}\n` +
          `  Copy it to a password manager or secure location.\n` +
          `  ${pc.red("If you lose this key, your encrypted .env files are unrecoverable.")}`,
        );
      } else {
        const importMethod = await askSelect({
          message: "How do you want to provide the key?",
          options: [
            { value: "base64", label: "Paste a base64 string — from your password manager" },
            { value: "file", label: "Enter a file path — key file already on this machine" },
          ],
        });

        if (importMethod === "base64") {
          const base64 = await askText({
            message: "Paste your base64-encoded key:",
            validate(value) {
              if (!value.trim()) return "Key string is required.";
              const buf = Buffer.from(value.trim(), "base64");
              if (buf.length === 0) return "Invalid base64 string.";
            },
          });

          const { writeFile, chmod } = await import("node:fs/promises");
          const { dirname } = await import("node:path");
          const { mkdir } = await import("node:fs/promises");
          await mkdir(dirname(keyPath), { recursive: true });
          await writeFile(keyPath, Buffer.from(base64.trim(), "base64"));
          await chmod(keyPath, 0o400);

          await withSpinner({
            start: "Unlocking vault...",
            stop: "Vault unlocked!",
            task: async () => {
              await unlockVault(vaultPath, keyPath);
            },
          });
        } else {
          const sourcePath = await askText({
            message: "Enter the path to your key file:",
            placeholder: "~/.sheltr/key",
            validate(value) {
              if (!value.trim()) return "Key path is required.";
            },
          });

          const resolvedSource = sourcePath.replace(/^~/, process.env.HOME ?? "");

          await withSpinner({
            start: "Importing key and unlocking vault...",
            stop: "Vault unlocked!",
            task: async () => {
              await importKey(resolvedSource, keyPath);
              await unlockVault(vaultPath, keyPath);
            },
          });
        }
      }

      // --- Save config ---
      config.vaults.push({
        name: vaultName,
        repoUrl,
        keyPath,
        vaultPath,
      });

      await writeConfig(config);

      console.log();
      log.info(
        pc.dim("Note: project and folder names in your vault repo are ") +
        pc.dim(pc.bold("not encrypted")) +
        pc.dim(" — only .env file contents are."),
      );

      log.success(`Vault "${vaultName}" configured.`);
      showOutro("Setup complete! Run `sheltr push` to sync your env files.");
    }));
}
