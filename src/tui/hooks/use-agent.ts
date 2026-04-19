import { startTransition, useState } from "react";

import { createCommandRuntime } from "../../cli/runtime.js";
import type { CommandMessage, ProjectSnapshot } from "../model.js";

const runtime = createCommandRuntime();

export function useAgent(projectDir: string, snapshot: ProjectSnapshot | null) {
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
    const userMessage = createMessage("user", "你", input);
    startTransition(() => {
      setMessages((current) => [...current, userMessage]);
    });

    try {
      const assistantBody = await resolveAssistantReply(projectDir, input, snapshot);
      startTransition(() => {
        setMessages((current) => [...current, createMessage("assistant", "LoreCraft", assistantBody)]);
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

async function resolveAssistantReply(
  projectDir: string,
  input: string,
  snapshot: ProjectSnapshot | null,
): Promise<string> {
  if (input === "/help") {
    return [
      "支持命令：",
      "- /help",
      "- /status",
      "- /lookup <关键词>",
      "- /view <dashboard|chat|memory|outline|tasks|conflicts|confirm|diff>",
      "- 其他 `/write`、`/check`、`/plan` 指令会先做本地编排分析",
    ].join("\n");
  }

  if (input === "/status") {
    if (!snapshot?.isProject || snapshot.status === null) {
      return "当前目录还不是 LoreCraft 项目。先执行 /init，或用 `lorecraft tui -d <项目目录>` 启动。";
    }

    return [
      `项目：${snapshot.name}`,
      `体裁：${snapshot.genre}`,
      `当前卷/章：第 ${snapshot.status.currentVolume} 卷 / 第 ${snapshot.status.currentChapter} 章`,
      `计划章节：${snapshot.status.totalChaptersPlanned}`,
      `未回收伏笔：${snapshot.status.openForeshadowing}`,
      `待确认项：${snapshot.status.pendingConfirmations}`,
    ].join("\n");
  }

  if (input.startsWith("/lookup ")) {
    const query = input.replace(/^\/lookup\s+/u, "").trim();
    if (!query) {
      return "请在 /lookup 后提供关键词。";
    }

    const services = await runtime.createProjectServices(projectDir);
    try {
      const results = await services.retriever.search({
        text: query,
        maxResults: 5,
        rules: [{ type: "canon_over_draft", weight: 1 }],
      });

      if (results.length === 0) {
        return `没有检索到与“${query}”相关的上下文。`;
      }

      return results
        .map(
          (result, index) =>
            `${index + 1}. [${result.layer}/${result.category}] ${result.source}\n${result.content.replace(/\s+/gu, " ").slice(0, 140)}`,
        )
        .join("\n\n");
    } finally {
      services.close();
    }
  }

  if (input.startsWith("/view ")) {
    return `即将切换到 ${input.replace(/^\/view\s+/u, "").trim()} 视图。`;
  }

  if (!snapshot?.isProject) {
    return "当前目录还不是 LoreCraft 项目。先执行 /init <name>，再进入写作工作台。";
  }

  const services = await runtime.createProjectServices(projectDir);
  try {
    const plan = services.orchestratorAgent.analyzeIntent(input.startsWith("/") ? input : `/plan ${input}`);
    return [
      `识别意图：${plan.intent}`,
      `建议模块：${plan.modules.join(" / ")}`,
      `需要上下文：${plan.requiredContext.join("、")}`,
      `风险等级：${plan.riskLevel}`,
      `是否需要确认：${plan.needsConfirmation ? "是" : "否"}`,
    ].join("\n");
  } finally {
    services.close();
  }
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

