import path from "node:path";
import { Command } from "commander";

import { ProjectManager } from "../../core/project.js";

export function createStatusCommand(projectManager = new ProjectManager()): Command {
  return new Command("status")
    .description("查看项目状态")
    .option("-d, --directory <dir>", "项目目录", process.cwd())
    .action(async (options: { directory: string }) => {
      const project = await projectManager.load(path.resolve(options.directory));
      const status = await projectManager.getStatus(project);

      const lastSession = status.lastSession
        ? `${status.lastSession.date.toISOString().slice(0, 10)} ${status.lastSession.headline}`
        : "无";

      const lines = [
        `项目: ${project.config.name}`,
        `当前卷/章: 第 ${status.currentVolume} 卷 / 第 ${status.currentChapter} 章`,
        `计划章节数: ${status.totalChaptersPlanned}`,
        `Canon 实体: ${status.canonStats.totalEntities}（人物 ${status.canonStats.characters} / 地点 ${status.canonStats.locations} / 势力 ${status.canonStats.factions}）`,
        `未回收伏笔: ${status.openForeshadowing}`,
        `待确认项: ${status.pendingConfirmations}`,
        `上次会话: ${lastSession}`,
      ];

      process.stdout.write(`${lines.join("\n")}\n`);
    });
}
