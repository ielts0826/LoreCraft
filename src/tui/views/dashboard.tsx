import { Box, Text } from "ink";

import { Markdown } from "../components/markdown.js";
import { Panel } from "../components/panel.js";
import { ScrollList } from "../components/scroll-list.js";
import type { ProjectSnapshot, TaskItem } from "../model.js";
import { splashSubtitle, splashTitle, tuiTheme } from "../theme.js";

export function DashboardView({
  snapshot,
  tasks,
  width,
}: {
  snapshot: ProjectSnapshot | null;
  tasks: TaskItem[];
  width: number;
}) {
  const metrics = snapshot?.status
    ? [
        `第 ${snapshot.status.currentVolume} 卷 / 第 ${snapshot.status.currentChapter} 章`,
        `${snapshot.status.totalChaptersPlanned} 个章节简报`,
        `${snapshot.status.openForeshadowing} 条未回收伏笔`,
      ]
    : ["未加载项目", "等待初始化", "可直接输入 /init"];

  const stacked = width < 120;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text color={tuiTheme.gold} bold>
          {splashTitle}
        </Text>
        <Text color={tuiTheme.muted}>{splashSubtitle}</Text>
      </Box>

      <Box flexDirection={stacked ? "column" : "row"} gap={1}>
        <Box flexGrow={1} flexBasis={0}>
          <Panel title="项目状态">
            <Markdown
              content={[
                `## ${snapshot?.name ?? "未加载项目"}`,
                `- 目录：${snapshot?.directory ?? "-"}`,
                `- 类型：${snapshot?.genre ?? "-"}`,
                `- 说明：${snapshot?.problem ?? "项目已加载，可直接开始工作。"}`
              ].join("\n")}
            />
          </Panel>
        </Box>

        <Box flexGrow={1} flexBasis={0}>
          <Panel title="即时概览" accent="blue">
            <ScrollList items={metrics.map((item) => ({ label: item }))} />
          </Panel>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection={stacked ? "column" : "row"} gap={1}>
        <Box flexGrow={1} flexBasis={0}>
          <Panel title="建议动作">
            <ScrollList
              items={tasks.map((task) => ({
                label: task.title,
                meta: task.tone === "danger" ? "高优先级" : task.tone === "success" ? "就绪" : "建议",
                tone: task.tone === "danger" ? "danger" : task.tone === "success" ? "success" : "normal",
              }))}
            />
          </Panel>
        </Box>

        <Box flexGrow={1} flexBasis={0}>
          <Panel title="快捷命令">
            <ScrollList items={(snapshot?.commandHints ?? []).map((item) => ({ label: item, tone: "muted" }))} />
          </Panel>
        </Box>
      </Box>
    </Box>
  );
}

