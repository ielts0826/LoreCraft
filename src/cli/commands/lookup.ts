import path from "node:path";
import { Command } from "commander";

import { createCommandRuntime } from "../runtime.js";

export function createLookupCommand(runtime = createCommandRuntime()): Command {
  return new Command("lookup")
    .description("查询故事知识库")
    .argument("<query>", "查询文本")
    .option("-d, --directory <dir>", "项目目录", process.cwd())
    .option("-n, --limit <number>", "返回数量", "5")
    .action(async (query: string, options: { directory: string; limit: string }) => {
      const services = await runtime.createProjectServices(path.resolve(options.directory));
      try {
        const results = await services.retriever.search({
          text: query,
          maxResults: Number.parseInt(options.limit, 10) || 5,
          rules: [{ type: "canon_over_draft", weight: 1 }],
        });

        if (results.length === 0) {
          process.stdout.write("未找到相关结果。\n");
          return;
        }

        const lines = results.flatMap((result, index) => [
          `${index + 1}. ${result.source}`,
          `   layer=${result.layer} category=${result.category} score=${result.score.toFixed(3)}`,
          `   ${truncate(result.content.replace(/\s+/gu, " ").trim(), 180)}`,
        ]);
        process.stdout.write(`${lines.join("\n")}\n`);
      } finally {
        services.close();
      }
    });
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}
