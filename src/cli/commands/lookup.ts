import path from "node:path";
import { Command } from "commander";

import { lookupKnowledge } from "../workflows.js";

export function createLookupCommand(): Command {
  return new Command("lookup")
    .description("查询故事知识库")
    .argument("<query>", "查询文本")
    .option("-d, --directory <dir>", "项目目录", process.cwd())
    .option("-n, --limit <number>", "返回数量", "5")
    .action(async (query: string, options: { directory: string; limit: string }) => {
      const output = await lookupKnowledge(path.resolve(options.directory), query, {
        limit: Number.parseInt(options.limit, 10) || 5,
      });
      process.stdout.write(`${output}\n`);
    });
}
