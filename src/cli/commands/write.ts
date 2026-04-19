import path from "node:path";
import { Command } from "commander";

import { writeChapter } from "../workflows.js";

export function createWriteCommand(): Command {
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
      const result = await writeChapter(path.resolve(options.directory), chapter, options);
      process.stdout.write(`已写入章节: ${result.outputPath}\n`);
    });
}
