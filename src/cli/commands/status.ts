import path from "node:path";
import { Command } from "commander";

import { getProjectStatus } from "../workflows.js";

export function createStatusCommand(): Command {
  return new Command("status")
    .description("查看项目状态")
    .option("-d, --directory <dir>", "项目目录", process.cwd())
    .action(async (options: { directory: string }) => {
      const status = await getProjectStatus(path.resolve(options.directory));
      process.stdout.write(`${status.summary}\n`);
    });
}
