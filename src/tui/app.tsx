import path from "node:path";
import { Box, Text, render, useApp, useInput } from "ink";
import { useEffect, useState } from "react";

import { filterTuiCommands, shouldAutocompleteCommandInput } from "./commands.js";
import { CommandPalette } from "./components/command-palette.js";
import { CommandInput } from "./components/input.js";
import { useAgent } from "./hooks/use-agent.js";
import { useProject } from "./hooks/use-project.js";
import { buildTaskItems, viewLabels, viewOrder, type TuiViewId } from "./model.js";
import { footerHotkeys, tuiTheme } from "./theme.js";
import { ChatView } from "./views/chat.js";
import { ConfirmView } from "./views/confirm.js";
import { ConflictsView } from "./views/conflicts.js";
import { DashboardView } from "./views/dashboard.js";
import { DiffView } from "./views/diff.js";
import { MemoryView } from "./views/memory.js";
import { OutlineTreeView } from "./views/outline-tree.js";
import { TasksView } from "./views/tasks.js";

export async function launchTui({ directory }: { directory: string }): Promise<void> {
  const app = render(<LoreCraftApp directory={directory} />);
  await app.waitUntilExit();
}

function LoreCraftApp({ directory }: { directory: string }) {
  const { exit } = useApp();
  const [currentDirectory, setCurrentDirectory] = useState(path.resolve(directory));
  const [activeView, setActiveView] = useState<TuiViewId>("dashboard");
  const [input, setInput] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const { snapshot, loading, error, refresh } = useProject(currentDirectory);
  const { messages, pending, submit, clear } = useAgent({
    projectDir: currentDirectory,
    snapshot,
    onDirectoryChange: setCurrentDirectory,
    onViewChange: setActiveView,
    onAfterCommand: refresh,
  });
  const tasks = buildTaskItems(snapshot ?? fallbackSnapshot(currentDirectory, error), messages);
  const width = process.stdout.columns ?? 120;
  const filteredCommands = filterTuiCommands(input);
  const paletteVisible = filteredCommands.length > 0;
  const activePaletteCommand = filteredCommands[Math.min(paletteIndex, Math.max(filteredCommands.length - 1, 0))];

  useEffect(() => {
    setPaletteIndex(0);
  }, [input]);

  useInput((value, key) => {
    if (key.ctrl && value === "c") {
      exit();
      return;
    }

    if (key.ctrl && value === "r") {
      void refresh();
      return;
    }

    if (key.ctrl && value === "l") {
      clear();
      return;
    }

    if (key.ctrl && value === "p") {
      setActiveView("chat");
      setInput("/");
      return;
    }

    if (key.ctrl && value === "n") {
      setInput("/init ");
      return;
    }

    if (key.ctrl && value === "o") {
      setInput("/open ");
      return;
    }

    if (paletteVisible && key.downArrow) {
      setPaletteIndex((current) => (current + 1) % filteredCommands.length);
      return;
    }

    if (paletteVisible && key.upArrow) {
      setPaletteIndex((current) => (current - 1 + filteredCommands.length) % filteredCommands.length);
      return;
    }

    if (key.tab) {
      if (paletteVisible && activePaletteCommand) {
        setInput(activePaletteCommand.template);
        return;
      }

      setActiveView(nextView(activeView, key.shift));
      return;
    }

    if (paletteVisible && key.escape) {
      setInput("");
      return;
    }

    if (key.return) {
      if (paletteVisible && shouldAutocompleteCommandInput(input, activePaletteCommand)) {
        setInput(activePaletteCommand?.template ?? input);
        return;
      }

      void submit(input);
      setInput("");
      return;
    }

    if (key.backspace || key.delete) {
      setInput((current) => current.slice(0, -1));
      return;
    }

    if (value.length > 0 && !key.ctrl && !key.meta) {
      setInput((current) => `${current}${value}`);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color={tuiTheme.muted}>
          {currentDirectory} | {loading ? "刷新中" : pending ? "处理中" : "就绪"} | 当前视图：{viewLabels[activeView]}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={tuiTheme.softGold}>
          {viewOrder.map((view) => (view === activeView ? `[${viewLabels[view]}]` : viewLabels[view])).join("  ")}
        </Text>
      </Box>

      <Box flexGrow={1} minHeight={20}>
        {activeView === "dashboard" ? <DashboardView snapshot={snapshot} tasks={tasks} width={width} /> : null}
        {activeView === "chat" ? <ChatView messages={messages} /> : null}
        {activeView === "memory" ? <MemoryView snapshot={snapshot} /> : null}
        {activeView === "outline" ? <OutlineTreeView snapshot={snapshot} /> : null}
        {activeView === "tasks" ? <TasksView tasks={tasks} /> : null}
        {activeView === "conflicts" ? <ConflictsView snapshot={snapshot} /> : null}
        {activeView === "confirm" ? <ConfirmView snapshot={snapshot} /> : null}
        {activeView === "diff" ? <DiffView snapshot={snapshot} /> : null}
      </Box>

      <Box marginTop={1}>
        <CommandInput
          value={input}
          placeholder="输入命令或写作意图，例如 /lookup 主角、/write ch001、/plan 一个仙侠悬疑故事"
        />
      </Box>
      {paletteVisible ? (
        <Box marginTop={1}>
          <CommandPalette commands={filteredCommands} activeIndex={paletteIndex} />
        </Box>
      ) : null}

      <Box marginTop={1} justifyContent="space-between">
        <Text color={tuiTheme.muted}>{footerHotkeys.join("  |  ")}</Text>
        <Text color={tuiTheme.muted}>1.0-beta</Text>
      </Box>

      {error ? (
        <Box marginTop={1}>
          <Text color={tuiTheme.danger}>提示：{error}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function nextView(current: TuiViewId, reverse = false): TuiViewId {
  const index = viewOrder.indexOf(current);
  const delta = reverse ? -1 : 1;
  const nextIndex = (index + delta + viewOrder.length) % viewOrder.length;
  return viewOrder[nextIndex]!;
}

function fallbackSnapshot(directory: string, problem: string | null) {
  return {
    directory,
    isProject: false,
    name: "未加载项目",
    genre: "unknown",
    status: null,
    openLoops: [],
    contradictionPreview: [],
    outlineNodes: [],
    pendingTransactions: [],
    commandHints: [],
    problem,
  };
}
