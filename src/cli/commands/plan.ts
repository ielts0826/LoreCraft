import path from "node:path";
import { Command } from "commander";

import { createCommandRuntime, selectModel } from "../runtime.js";

export function createPlanCommand(runtime = createCommandRuntime()): Command {
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
      const services = await runtime.createProjectServices(path.resolve(options.directory));
      try {
        const modelSelection = selectModel(services.project.config, "writer", options);
        const canonSummary = (await services.store.listCanon())
          .slice(0, 50)
          .map((entry) => `- [${entry.category}] ${entry.name}`)
          .join("\n") || "当前没有 canon。";

        const response = await services.llmClient.generate({
          provider: modelSelection.provider,
          model: modelSelection.model,
          temperature: 0.4,
          maxTokens: 2_500,
          messages: [
            {
              role: "system",
              content: [
                "你是 LoreCraft 的规划引擎。",
                "请根据用户给出的故事点子，生成“最小可行规划”，只覆盖足够启动第一卷写作的内容。",
                "",
                "输出中文 markdown，必须包含：",
                "- 核心世界观框架",
                "- 故事主线",
                "- 分卷构想",
                "- 第一卷章节推进",
                "- 主角与核心配角",
                "- 后续待扩展空位",
                "",
                "已有 canon：",
                canonSummary,
              ].join("\n"),
            },
            { role: "user", content: description },
          ],
        });

        process.stdout.write(`${response.content.trim()}\n`);
      } finally {
        services.close();
      }
    });
}
