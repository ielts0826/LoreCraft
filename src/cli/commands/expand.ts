import path from "node:path";
import { Command } from "commander";

import { expandOutline } from "../workflows.js";

export function createExpandCommand(): Command {
  return new Command("expand")
    .description("基于卷大纲生成增量扩展计划")
    .argument("<outlineFile>", "卷大纲文件")
    .option("-d, --directory <dir>", "项目目录", process.cwd())
    .option("--provider <provider>", "覆盖 provider")
    .option("--model <model>", "覆盖 model")
    .action(async (outlineFile: string, options: {
      directory: string;
      provider?: string;
      model?: string;
    }) => {
      const output = await expandOutline(path.resolve(options.directory), outlineFile, options);
      process.stdout.write(`${output}\n`);
    });
}
