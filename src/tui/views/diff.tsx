import { Box, Text } from "ink";

import { Panel } from "../components/panel.js";
import { ScrollList, type ScrollListItem } from "../components/scroll-list.js";
import type { ProjectSnapshot } from "../model.js";
import { tuiTheme } from "../theme.js";

export function DiffView({ snapshot }: { snapshot: ProjectSnapshot | null }) {
  const items: ScrollListItem[] =
    snapshot?.pendingTransactions.flatMap((transaction) => {
      const header: ScrollListItem = {
        label: `${transaction.description} (${transaction.id})`,
        meta: `${transaction.state} / ${transaction.operationCount} 项`,
        tone: transaction.state === "failed" ? "danger" : "normal",
      };

      const targets = transaction.targets.slice(0, 3).map<ScrollListItem>((target) => ({
        label: `  ${target}`,
        tone: "muted",
      }));

      return [header, ...targets];
    }) ?? [];

  return (
    <Panel title="变更与事务">
      {items.length > 0 ? (
        <Box flexDirection="column">
          <ScrollList items={items} maxItems={14} />
          <Box marginTop={1}>
            <Text color={tuiTheme.muted}>输入 /diff 查看详情，/commit 提交，/rollback 回滚。</Text>
          </Box>
        </Box>
      ) : (
        <Text color={tuiTheme.muted}>当前没有未完成事务。</Text>
      )}
    </Panel>
  );
}
