import { Panel } from "../components/panel.js";
import { ScrollList } from "../components/scroll-list.js";
import type { TaskItem } from "../model.js";

export function TasksView({ tasks }: { tasks: TaskItem[] }) {
  return (
    <Panel title="任务面板">
      <ScrollList
        items={tasks.map((task) => ({
          label: task.title,
          meta: task.detail,
          tone: task.tone === "danger" ? "danger" : task.tone === "success" ? "success" : "muted",
        }))}
        maxItems={10}
      />
    </Panel>
  );
}
