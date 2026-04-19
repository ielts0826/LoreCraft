import path from "node:path";
import { Command } from "commander";

import { planStory } from "../workflows.js";

export function createPlanCommand(): Command {
  return new Command("plan")
    .description("根据点子生成最小可行规划")
    .argument("<description>", "故事点子或规划描述")
    .option("-d, --directory <dir>", "项目目录", process.cwd())
    .option("--provider <provider>", "覆盖 provider")
    .option("--model <model>", "覆盖 model")
    .action(async (description: string, options: {
      directory: string;
      provider?: string;
      model?: string;
    }) => {
      const output = await planStory(path.resolve(options.directory), description, options);
      process.stdout.write(`${output}\n`);
    });
}
