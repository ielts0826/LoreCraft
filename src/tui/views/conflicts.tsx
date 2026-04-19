import { Text } from "ink";

import { Panel } from "../components/panel.js";
import { ScrollList } from "../components/scroll-list.js";
import type { ProjectSnapshot } from "../model.js";
import { tuiTheme } from "../theme.js";

export function ConflictsView({ snapshot }: { snapshot: ProjectSnapshot | null }) {
  const items =
    snapshot?.contradictionPreview.map((entry) => ({
      label: entry,
      tone: "danger" as const,
    })) ?? [];

  return (
    <Panel title="冲突与矛盾" accent="danger">
      {items.length > 0 ? <ScrollList items={items} maxItems={12} /> : <Text color={tuiTheme.muted}>暂时没有记录到冲突日志。</Text>}
    </Panel>
  );
}

