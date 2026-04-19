import { Text } from "ink";

import { Panel } from "../components/panel.js";
import { ScrollList, type ScrollListItem } from "../components/scroll-list.js";
import type { ProjectSnapshot } from "../model.js";
import { tuiTheme } from "../theme.js";

export function DiffView({ snapshot }: { snapshot: ProjectSnapshot | null }) {
  const items: ScrollListItem[] =
    snapshot?.pendingTransactions.map((transaction) => ({
      label: transaction.description,
      meta: transaction.state,
      tone: transaction.state === "failed" ? "danger" : "muted",
    })) ?? [];

  return (
    <Panel title="变更与事务">
      {items.length > 0 ? <ScrollList items={items} maxItems={10} /> : <Text color={tuiTheme.muted}>当前没有未完成事务。</Text>}
    </Panel>
  );
}
