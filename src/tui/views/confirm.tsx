import { Box, Text } from "ink";

import { Panel } from "../components/panel.js";
import type { ProjectSnapshot } from "../model.js";
import { tuiTheme } from "../theme.js";

export function ConfirmView({ snapshot }: { snapshot: ProjectSnapshot | null }) {
  const pendingConfirmations = snapshot?.status?.pendingConfirmations ?? 0;
  const pendingTransactions = snapshot?.pendingTransactions.length ?? 0;

  return (
    <Panel title="确认队列" accent={pendingConfirmations > 0 || pendingTransactions > 0 ? "danger" : "success"}>
      <Box flexDirection="column">
        <Text color={pendingConfirmations > 0 ? tuiTheme.danger : tuiTheme.success}>
          {pendingConfirmations > 0
            ? `当前有 ${pendingConfirmations} 条待确认设定，需要人工确认后再写入正式设定。`
            : "当前没有待确认设定项。"}
        </Text>
        <Text color={pendingTransactions > 0 ? tuiTheme.gold : tuiTheme.muted}>
          {pendingTransactions > 0
            ? `当前有 ${pendingTransactions} 个待处理事务，可用 /diff、/commit、/rollback 控制。`
            : "当前没有待处理事务。"}
        </Text>
      </Box>
    </Panel>
  );
}
