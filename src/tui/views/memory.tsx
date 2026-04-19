import { Box, Text } from "ink";

import { Panel } from "../components/panel.js";
import { ScrollList } from "../components/scroll-list.js";
import type { ProjectSnapshot } from "../model.js";
import { tuiTheme } from "../theme.js";

export function MemoryView({ snapshot }: { snapshot: ProjectSnapshot | null }) {
  const status = snapshot?.status;
  const entityItems = status
    ? [
        { label: `人物`, meta: String(status.canonStats.characters) },
        { label: `地点`, meta: String(status.canonStats.locations) },
        { label: `势力`, meta: String(status.canonStats.factions) },
        { label: `总实体`, meta: String(status.canonStats.totalEntities) },
      ]
    : [{ label: "未加载", meta: "-" }];

  const loopItems =
    snapshot?.openLoops.map((item) => ({
      label: item,
      tone: "muted" as const,
    })) ?? [];

  return (
    <Box flexDirection="row" gap={1}>
      <Box flexGrow={1} flexBasis={0}>
        <Panel title="记忆概览">
          <ScrollList items={entityItems} />
        </Panel>
      </Box>
      <Box flexGrow={2} flexBasis={0}>
        <Panel title="未回收伏笔" accent="blue">
          {loopItems.length > 0 ? <ScrollList items={loopItems} /> : <Text color={tuiTheme.muted}>当前没有未回收伏笔。</Text>}
        </Panel>
      </Box>
    </Box>
  );
}

