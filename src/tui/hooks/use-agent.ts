import { startTransition, useState } from "react";

import { executeTuiInput } from "../commands.js";
import type { CommandMessage, ProjectSnapshot, TuiViewId } from "../model.js";

export function useAgent({
  projectDir,
  snapshot,
  onDirectoryChange,
  onViewChange,
}: {
  projectDir: string;
  snapshot: ProjectSnapshot | null;
  onDirectoryChange: (directory: string) => void;
  onViewChange: (view: TuiViewId) => void;
}) {
  const [messages, setMessages] = useState<CommandMessage[]>([
    {
      id: "welcome",
      role: "system",
      title: "LoreCraft 已就绪",
      body: "可以输入 /help、/status、/lookup 关键词，或直接输入一个写作意图。",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [pending, setPending] = useState(false);

  async function submit(rawInput: string) {
    const input = rawInput.trim();
    if (!input) {
      return;
    }

    setPending(true);
    startTransition(() => {
      setMessages((current) => [...current, createMessage("user", "你", input)]);
    });

    try {
      const result = await executeTuiInput({ projectDir, snapshot }, input);
      if (result.nextDirectory) {
        onDirectoryChange(result.nextDirectory);
      }
      if (result.nextView) {
        onViewChange(result.nextView);
      }

      startTransition(() => {
        setMessages((current) => [
          ...(result.clearHistory ? current.slice(0, 1) : current),
          createMessage("assistant", result.title, result.body),
        ]);
      });
    } catch (error) {
      startTransition(() => {
        setMessages((current) => [
          ...current,
          createMessage("assistant", "系统错误", error instanceof Error ? error.message : String(error)),
        ]);
      });
    } finally {
      setPending(false);
    }
  }

  function clear() {
    setMessages((current) => current.slice(0, 1));
  }

  return {
    messages,
    pending,
    submit,
    clear,
  };
}

function createMessage(role: CommandMessage["role"], title: string, body: string): CommandMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role,
    title,
    body,
    timestamp: new Date().toISOString(),
  };
}
