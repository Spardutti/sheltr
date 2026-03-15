import type { Command } from "commander";
import pc from "picocolors";
import { showIntro, showOutro, askText, askSelect, withSpinner, log } from "../ui/index.js";
import {
  configExists,
  writeConfig,
  getDefaultVaultPath,
  getDefaultKeyPath,
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

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Configure sheltr for a repository")
    .action(async () => {
      showIntro();

      // Check for existing config
      if (await configExists()) {
        const overwrite = await askConfirm({
          message: "Sheltr is already configured. Do you want to reconfigure?",
          initialValue: false,
        });
        if (!overwrite) {
          showOutro("Keeping existing configuration.");
          return;
        }
      }

      // Check git-crypt is available
      await ensureGitCryptInstalled();

      // --- Onboarding explanation ---
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
      console.log(`  ${pc.dim("2.")} Paste the URL below`);
      console.log(`  ${pc.dim("3.")} Sheltr encrypts and pushes your .env files there`);
      console.log();

      // --- Step 1: Repository ---
      log.info(pc.dim("Step 1 of 2") + " — Vault repository");

      const repoUrl = await askText({
        message: "Paste your vault repo URL (the empty private repo you just created):",
        placeholder: "https://github.com/user/env-vault.git",
        validate(value) {
          const v = value.trim();
          if (!v) return "Repository URL is required.";

          const isHttps = /^https:\/\/.+\/.+/.test(v);
          const isSsh = /^git@.+:.+\/.+/.test(v);

          if (!isHttps && !isSsh) {
            return "Enter a valid Git URL (https://... or git@...:user/repo)";
          }
        },
      });

      const vaultPath = getDefaultVaultPath();

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

      // --- Step 2: Encryption key ---
      console.log();
      log.info(pc.dim("Step 2 of 2") + " — Encryption key");

      const keyMethod = await askSelect({
        message: "How would you like to configure your encryption key?",
        options: [
          { value: "generate", label: "Generate a new key — first time setting up this vault" },
          { value: "import", label: "Import an existing key — setting up another machine" },
        ],
      });

      const keyPath = getDefaultKeyPath();

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
        const sourcePath = await askText({
          message: "Enter the path to your key file:",
          placeholder: "~/.sheltr/key",
          validate(value) {
            if (!value.trim()) return "Key path is required.";
          },
        });

        // Expand ~ to home directory
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

      // --- Save config ---
      await writeConfig({
        repoUrl,
        keyPath,
        vaultPath,
      });

      console.log();
      log.info(
        pc.dim("Note: project and folder names in your vault repo are ") +
        pc.dim(pc.bold("not encrypted")) +
        pc.dim(" — only .env file contents are."),
      );

      log.success("Configuration saved.");
      showOutro("Setup complete! Run `sheltr push` to sync your env files.");
    });
}
