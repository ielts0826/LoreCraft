import { Command } from "commander";

import { createInitCommand } from "./commands/init.js";
import { createStatusCommand } from "./commands/status.js";

export function createCli(): Command {
  const program = new Command();
  program.name("lorecraft").description("Long-form novel writing CLI/TUI agent.");
  program.addCommand(createInitCommand());
  program.addCommand(createStatusCommand());
  return program;
}
