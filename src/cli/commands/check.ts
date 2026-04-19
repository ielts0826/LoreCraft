import path from "node:path";
import { Command } from "commander";

import { formatReviewReport, reviewChapter } from "../workflows.js";

export function createCheckCommand(): Command {
  return new Command("check")
    .description("对章节执行一致性审查")
    .argument("[chapter]", "章节路径或章节 ID")
    .option("-d, --directory <dir>", "项目目录", process.cwd())
    .option("--provider <provider>", "覆盖 provider")
    .option("--model <model>", "覆盖 model")
    .action(async (chapter: string | undefined, options: {
      directory: string;
      provider?: string;
      model?: string;
    }) => {
      const report = await reviewChapter(path.resolve(options.directory), chapter, options);
      process.stdout.write(`${formatReviewReport(report)}\n`);
    });
}
