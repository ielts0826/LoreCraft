import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";

import { createCommandRuntime, selectModel } from "../runtime.js";
import { buildExpandPlannerPrompt } from "../../llm/prompts/expand-planner.js";

export function createExpandCommand(runtime = createCommandRuntime()): Command {
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
      const services = await runtime.createProjectServices(path.resolve(options.directory));
      try {
        const outlinePath = path.resolve(services.project.root, outlineFile);
        const outlineText = await fs.readFile(outlinePath, "utf8");
        const canonSummary = (await services.store.listCanon())
          .slice(0, 100)
          .map((entry) => `- [${entry.category}] ${entry.name}`)
          .join("\n") || "当前没有 canon。";
        const openLoops = (await services.store.getOpenLoops())
          .map((loop) => `- [${loop.id}] ${loop.description} (${loop.plantedIn})`)
          .join("\n");
        const modelSelection = selectModel(services.project.config, "writer", options);
        const prompt = buildExpandPlannerPrompt({
          outlineText,
          existingCanon: canonSummary,
          openLoops,
        });
        const response = await services.llmClient.generate({
          provider: modelSelection.provider,
          model: modelSelection.model,
          temperature: 0.3,
          maxTokens: 2_500,
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: `请基于 ${path.basename(outlinePath)} 生成增量扩展计划。` },
          ],
        });

        process.stdout.write(`${response.content.trim()}\n`);
      } finally {
        services.close();
      }
    });
}
