import type { Command } from "commander";
import { showIntro, showOutro, log } from "../ui/index.js";

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List stored projects")
    .action(async () => {
      showIntro();

      // TODO: fetch and display actual stored projects
      log.info("No projects stored yet. Run `sheltr setup` to get started.");

      showOutro();
    });
}
