#!/usr/bin/env node

import { Command } from "commander";
import { registerSetupCommand } from "./commands/setup.js";
import { registerPushCommand } from "./commands/push.js";
import { registerPullCommand } from "./commands/pull.js";
import { registerListCommand } from "./commands/list.js";
import { registerDeleteCommand } from "./commands/delete.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerKeyCommand } from "./commands/key.js";
import { registerVaultCommand } from "./commands/vault.js";
import { registerMoveCommand } from "./commands/move.js";
import { registerMigrateCommand } from "./commands/migrate.js";
import { registerPushAllCommand } from "./commands/push-all.js";
import { registerFileCommand } from "./commands/file.js";
import { registerSecretCommand } from "./commands/secret.js";
import { handleError } from "./utils/errors.js";

const program = new Command();

program
  .name("sheltr")
  .description("Encrypted .env file storage for teams")
  .version("0.6.0");

registerSetupCommand(program);
registerPushCommand(program);
registerPullCommand(program);
registerListCommand(program);
registerDeleteCommand(program);
registerStatusCommand(program);
registerKeyCommand(program);
registerVaultCommand(program);
registerMoveCommand(program);
registerMigrateCommand(program);
registerPushAllCommand(program);
registerFileCommand(program);
registerSecretCommand(program);

try {
  await program.parseAsync(process.argv);
} catch (error) {
  handleError(error);
}
