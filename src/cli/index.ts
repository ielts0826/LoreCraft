import { Command } from "commander";

import { createCheckCommand } from "./commands/check.js";
import { createExpandCommand } from "./commands/expand.js";
import { createInitCommand } from "./commands/init.js";
import { createLookupCommand } from "./commands/lookup.js";
import { createPlanCommand } from "./commands/plan.js";
import { createStatusCommand } from "./commands/status.js";
import { createTuiCommand } from "./commands/tui.js";
import { createWriteCommand } from "./commands/write.js";

export function createCli(): Command {
  const program = new Command();
  program.name("lorecraft").description("Long-form novel writing CLI/TUI agent.");
  program.addCommand(createInitCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createLookupCommand());
  program.addCommand(createCheckCommand());
  program.addCommand(createWriteCommand());
  program.addCommand(createPlanCommand());
  program.addCommand(createExpandCommand());
  program.addCommand(createTuiCommand());
  return program;
}
