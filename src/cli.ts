#!/usr/bin/env node

import { Command } from "commander";
import { registerSetupCommand } from "./commands/setup.js";
import { registerPushCommand } from "./commands/push.js";
import { registerPullCommand } from "./commands/pull.js";
import { registerListCommand } from "./commands/list.js";
import { registerDeleteCommand } from "./commands/delete.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerKeyCommand } from "./commands/key.js";
import { handleError } from "./utils/errors.js";

const program = new Command();

program
  .name("sheltr")
  .description("Encrypted .env file storage for teams")
  .version("0.2.2");

registerSetupCommand(program);
registerPushCommand(program);
registerPullCommand(program);
registerListCommand(program);
registerDeleteCommand(program);
registerStatusCommand(program);
registerKeyCommand(program);

try {
  await program.parseAsync(process.argv);
} catch (error) {
  handleError(error);
}
