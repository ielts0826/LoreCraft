import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";

import { createCommandRuntime, resolveChapterFile, selectModel } from "../runtime.js";

export function createCheckCommand(runtime = createCommandRuntime()): Command {
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
      const services = await runtime.createProjectServices(path.resolve(options.directory));
      try {
        const chapterFile = await resolveChapterFile(services.project.root, chapter);
        const chapterText = await fs.readFile(chapterFile, "utf8");
        const chapterId = path.basename(chapterFile, ".md");
        const context = await services.contextBuilder.buildReviewContext({
          chapterId,
          chapterText,
        });
        const modelSelection = selectModel(services.project.config, "reviewer", options);
        const report = await services.reviewerAgent.reviewChapter({
          provider: modelSelection.provider,
          model: modelSelection.model,
          chapterId,
          context,
        });

        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } finally {
        services.close();
      }
    });
}
