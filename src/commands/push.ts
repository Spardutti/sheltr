import type { Command } from "commander";
import { showIntro, showOutro, askMultiselect, askConfirm, withSpinner } from "../ui/index.js";

export function registerPushCommand(program: Command): void {
  program
    .command("push")
    .description("Encrypt and push env files")
    .action(async () => {
      showIntro();

      // TODO: discover actual .env files in the project
      const files = await askMultiselect({
        message: "Select env files to push:",
        options: [
          { value: ".env", label: ".env" },
          { value: ".env.local", label: ".env.local" },
          { value: ".env.production", label: ".env.production" },
        ],
        required: true,
      });

      const confirmed = await askConfirm({
        message: `Push ${files.length} file(s)?`,
      });

      if (!confirmed) {
        showOutro("Push cancelled.");
        return;
      }

      await withSpinner({
        start: "Encrypting and pushing...",
        stop: "Files pushed successfully!",
        task: async () => {
          // TODO: implement actual encryption and push
          await new Promise((resolve) => setTimeout(resolve, 1500));
        },
      });

      showOutro("Push complete!");
    });
}
