import path from "node:path";
import { Command } from "commander";

import { createCommandRuntime, resolveChapterBrief, resolveWriteOutputPath, selectModel } from "../runtime.js";
import { ProjectError } from "../../shared/errors.js";
import type { Project } from "../../shared/types.js";

export function createWriteCommand(runtime = createCommandRuntime()): Command {
  return new Command("write")
    .description("写指定章节并落盘")
    .argument("<chapter>", "章节 ID，如 ch012")
    .option("-d, --directory <dir>", "项目目录", process.cwd())
    .option("--brief <text>", "章节简报")
    .option("--brief-file <file>", "章节简报文件")
    .option("--volume <number>", "卷号")
    .option("--provider <provider>", "覆盖 provider")
    .option("--model <model>", "覆盖 model")
    .action(async (chapter: string, options: {
      directory: string;
      brief?: string;
      briefFile?: string;
      volume?: string;
      provider?: string;
      model?: string;
    }) => {
      const services = await runtime.createProjectServices(path.resolve(options.directory));
      try {
        const chapterBrief = await loadChapterBrief(services.project.root, chapter, options);
        if (!chapterBrief) {
          throw new ProjectError("缺少章节简报。请使用 --brief / --brief-file，或先在 chapter_briefs 中准备对应文件。");
        }

        const volumeNumber = await resolveVolumeNumber(runtime, services.project, options.volume);
        const context = await services.contextBuilder.buildWriteContext({
          chapterId: chapter,
          chapterBrief,
          userIntent: `/write ${chapter}`,
        });
        const modelSelection = selectModel(services.project.config, "writer", options);
        const draft = await services.writerAgent.draftChapter({
          provider: modelSelection.provider,
          model: modelSelection.model,
          chapterId: chapter,
          chapterInstruction: `写 ${chapter}：${chapterBrief.trim()}`,
          context,
        });

        const outputPath = resolveWriteOutputPath(services.project.root, chapter, volumeNumber);
        const tx = await services.transactionManager.begin(services.project.root, `Write ${chapter}`);
        await tx.stage(outputPath, `${draft.content.trim()}\n`, `write chapter ${chapter}`);
        await tx.commit();

        process.stdout.write(`已写入章节: ${outputPath}\n`);
      } finally {
        services.close();
      }
    });
}

async function loadChapterBrief(
  projectRoot: string,
  chapterId: string,
  options: { brief?: string; briefFile?: string },
): Promise<string | null> {
  if (options.brief?.trim()) {
    return options.brief;
  }

  if (options.briefFile) {
    const resolved = path.resolve(projectRoot, options.briefFile);
    return import("node:fs/promises").then(async (fs) => fs.readFile(resolved, "utf8"));
  }

  return resolveChapterBrief(projectRoot, chapterId);
}

async function resolveVolumeNumber(
  runtime: ReturnType<typeof createCommandRuntime>,
  project: Project,
  rawVolume?: string,
): Promise<number> {
  if (rawVolume) {
    const parsed = Number.parseInt(rawVolume, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ProjectError(`非法卷号: ${rawVolume}`);
    }

    return parsed;
  }

  const status = await runtime.projectManager.getStatus(project);
  return Math.max(status.currentVolume, 1);
}
