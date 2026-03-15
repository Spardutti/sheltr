import type { Command } from "commander";
import { showIntro, showOutro, askText, log } from "../ui/index.js";

export function registerDeleteCommand(program: Command): void {
  program
    .command("delete")
    .description("Delete a stored project")
    .argument("[project]", "Project name to delete")
    .action(async (project?: string) => {
      showIntro();

      const projectName = project ?? "my-project"; // TODO: resolve actual project name

      log.warn(`This will permanently delete all stored env files for "${projectName}".`);

      const confirmation = await askText({
        message: `Type "${projectName}" to confirm deletion:`,
        validate(value) {
          if (value !== projectName) {
            return `Please type "${projectName}" exactly to confirm.`;
          }
        },
      });

      void confirmation;

      // TODO: implement actual deletion
      log.success(`Project "${projectName}" deleted.`);
      showOutro();
    });
}
