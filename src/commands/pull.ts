import type { Command } from "commander";
import { showIntro, showOutro, askSelect, askMultiselect, withSpinner } from "../ui/index.js";

export function registerPullCommand(program: Command): void {
  program
    .command("pull")
    .description("Pull and decrypt env files")
    .action(async () => {
      showIntro();

      // TODO: fetch actual available files from remote
      const files = await askMultiselect({
        message: "Select files to pull:",
        options: [
          { value: ".env", label: ".env" },
          { value: ".env.local", label: ".env.local" },
          { value: ".env.production", label: ".env.production" },
        ],
        required: true,
      });

      // TODO: detect actual conflicts
      const hasConflict = false;

      if (hasConflict) {
        await askSelect({
          message: "Conflict detected for .env — how do you want to resolve it?",
          options: [
            { value: "overwrite", label: "Overwrite local file" },
            { value: "skip", label: "Skip this file" },
            { value: "backup", label: "Backup local, then overwrite" },
          ],
        });
      }

      await withSpinner({
        start: `Pulling ${files.length} file(s)...`,
        stop: "Files pulled and decrypted!",
        task: async () => {
          // TODO: implement actual pull and decryption
          await new Promise((resolve) => setTimeout(resolve, 1500));
        },
      });

      showOutro("Pull complete!");
    });
}
