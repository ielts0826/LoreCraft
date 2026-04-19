import { Text } from "ink";

import { Panel } from "../components/panel.js";
import type { ProjectSnapshot } from "../model.js";
import { tuiTheme } from "../theme.js";

export function ConfirmView({ snapshot }: { snapshot: ProjectSnapshot | null }) {
  const pending = snapshot?.status?.pendingConfirmations ?? 0;

  return (
    <Panel title="确认队列" accent={pending > 0 ? "danger" : "success"}>
      <Text color={pending > 0 ? tuiTheme.danger : tuiTheme.success}>
        {pending > 0 ? `当前有 ${pending} 条待确认项，需要人工确认后再写入正式设定。` : "当前没有待确认项。"}
      </Text>
    </Panel>
  );
}

