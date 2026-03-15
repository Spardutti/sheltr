import type { Command } from "commander";
import { showIntro, showOutro, askText, askSelect } from "../ui/index.js";

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Configure sheltr for a repository")
    .action(async () => {
      showIntro();

      const repoUrl = await askText({
        message: "What is your Git repository URL?",
        placeholder: "https://github.com/user/repo.git",
        validate(value) {
          if (!value.trim()) return "Repository URL is required.";
        },
      });

      const keyMethod = await askSelect({
        message: "How would you like to configure your encryption key?",
        options: [
          { value: "generate", label: "Generate a new key" },
          { value: "import", label: "Import an existing key" },
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

      showOutro("Setup complete! Run `sheltr push` to sync your env files.");
    });
}
