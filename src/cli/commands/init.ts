import path from "node:path";
import { Command } from "commander";

import { ProjectManager } from "../../core/project.js";

export function createInitCommand(projectManager = new ProjectManager()): Command {
  return new Command("init")
    .description("初始化新的 LoreCraft 项目")
    .argument("<name>", "项目名称")
    .option("-d, --directory <dir>", "目标目录", process.cwd())
    .option("--genre <genre>", "项目类型", "general")
    .option("--in-place", "在指定目录直接初始化", false)
    .action(async (name: string, options: { directory: string; genre: string; inPlace: boolean }) => {
      const project = await projectManager.create(name, {
        baseDir: path.resolve(options.directory),
        genre: options.genre,
        inPlace: options.inPlace,
      });

      process.stdout.write(`已创建项目: ${project.config.name}\n路径: ${project.root}\n`);
    });
}
