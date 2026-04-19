import { Text } from "ink";

import { Panel } from "../components/panel.js";
import { ScrollList, type ScrollListItem } from "../components/scroll-list.js";
import type { ProjectSnapshot } from "../model.js";
import { tuiTheme } from "../theme.js";

export function OutlineTreeView({ snapshot }: { snapshot: ProjectSnapshot | null }) {
  const items: ScrollListItem[] =
    snapshot?.outlineNodes.map((node) => ({
      label: `${node.kind === "volume" ? "◆" : "└"} ${node.label}`,
      tone: node.kind === "volume" ? "success" : "muted",
    })) ?? [];

  return (
    <Panel title="大纲树">
      {items.length > 0 ? <ScrollList items={items} maxItems={14} /> : <Text color={tuiTheme.muted}>还没有卷纲或章节简报。</Text>}
    </Panel>
  );
}
