import path from "node:path";
import { Command } from "commander";

import { launchTui } from "../../tui/app.js";

export function createTuiCommand(): Command {
  return new Command("tui")
    .description("启动终端写作工作台")
    .option("-d, --directory <dir>", "项目目录", process.cwd())
    .action(async (options: { directory: string }) => {
      await launchTui({
        directory: path.resolve(options.directory),
      });
    });
}
