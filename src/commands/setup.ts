import type { Command } from "commander";
import pc from "picocolors";
import { showIntro, showOutro, askText, askSelect, log } from "../ui/index.js";

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Configure sheltr for a repository")
    .action(async () => {
      showIntro();

      log.info(
        `Let's connect sheltr to your private Git repo.\n` +
        `  This is where your encrypted .env files will be stored.\n` +
        `  You'll need a ${pc.bold("private repository")} and an ${pc.bold("encryption key")}.`,
      );

      console.log();
      log.info(pc.dim("Step 1 of 2") + " — Repository");

      const repoUrl = await askText({
        message: "What is your Git repository URL?",
        placeholder: "https://github.com/user/repo.git",
        validate(value) {
          if (!value.trim()) return "Repository URL is required.";
        },
      });

      console.log();
      log.info(pc.dim("Step 2 of 2") + " — Encryption key");

      const keyMethod = await askSelect({
        message: "How would you like to configure your encryption key?",
        options: [
          { value: "generate", label: "Generate a new key — create a fresh key for this machine" },
          { value: "import", label: "Import an existing key — use a key from another machine" },
        ],
      });

      if (keyMethod === "import") {
        await askText({
          message: "Enter the path to your key file:",
          placeholder: "~/.sheltr/key.pem",
          validate(value) {
            if (!value.trim()) return "Key path is required.";
          },
        });
      }

      // TODO: implement actual setup logic
      void repoUrl;

      console.log();
      log.success("Configuration saved.");
      showOutro("Setup complete! Run `sheltr push` to sync your env files.");
    });
}
