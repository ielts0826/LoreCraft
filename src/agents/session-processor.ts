import path from "node:path";

import { createCommandRuntime, selectModel } from "../cli/runtime.js";
import { ProjectManager } from "../core/project.js";
import { LLMProviderError } from "../llm/types.js";
import { createBuiltinToolRegistry } from "../tools/builtin.js";
import type { ToolCall, ToolResult } from "../tools/types.js";
import { RunLogger } from "./run-log.js";

export interface AgentSessionProcessorOptions {
  runtime?: ReturnType<typeof createCommandRuntime> | undefined;
  projectManager?: ProjectManager | undefined;
}

export interface AgentSessionResult {
  answer: string;
  usedTools: string[];
}

interface RoutePlan {
  answer?: string | undefined;
  tool_calls?: ToolCall[] | undefined;
}

interface FallbackAnswerOptions {
  modelIssue?: string | undefined;
}

const MAX_TOOL_CALLS = 5;

export class AgentSessionProcessor {
  private readonly runtime: ReturnType<typeof createCommandRuntime>;
  private readonly projectManager: ProjectManager;

  public constructor(options: AgentSessionProcessorOptions = {}) {
    this.runtime = options.runtime ?? createCommandRuntime();
    this.projectManager = options.projectManager ?? new ProjectManager();
  }

  public async process(projectDir: string, userInput: string): Promise<AgentSessionResult> {
    const trimmed = userInput.trim();
    if (isIdentityQuestion(trimmed)) {
      return {
        answer: "我是 LoreCraft，一个运行在终端里的中文长篇小说写作 agent。我可以帮你读取项目文件、理解设定、检索记忆、规划大纲、审查章节，并在需要写入时通过事务确认保护你的稿件。",
        usedTools: [],
      };
    }

    const projectRoot = path.resolve(projectDir);
    try {
      await this.projectManager.load(projectRoot);
    } catch {
      return {
        answer: "当前目录还不是 LoreCraft 项目。你可以先输入 /init 创建项目，或输入 /open 切换到已有项目目录。",
        usedTools: [],
      };
    }

    const logger = new RunLogger(projectRoot);
    await logger.write({ type: "user_message", content: trimmed });

    const registry = createBuiltinToolRegistry();
    const services = await this.runtime.createProjectServices(projectRoot);
    try {
      const heuristicPlan = buildHeuristicRoutePlan(trimmed);
      let modelIssue: string | undefined;
      const routePlan = await this.buildRoutePlan(trimmed, services).catch((error: unknown) => {
        modelIssue = formatModelIssue(error);
        return heuristicPlan;
      });
      const toolCalls = normalizeToolCalls(routePlan.tool_calls?.length ? routePlan.tool_calls : heuristicPlan.tool_calls ?? []);
      await logger.write({ type: "route_plan", toolCalls });

      const toolResults: ToolResult[] = [];
      for (const call of toolCalls.slice(0, MAX_TOOL_CALLS)) {
        await logger.write({ type: "tool_call", tool: call.tool, args: call.args });
        const result = await registry.execute(call, { projectRoot });
        toolResults.push(result);
        await logger.write({
          type: "tool_result",
          tool: result.tool,
          status: result.status,
          error: result.error,
        });
      }

      const answer = await this.buildFinalAnswer(trimmed, routePlan, toolResults, services).catch((error: unknown) =>
        formatFallbackAnswer(trimmed, toolResults, routePlan.answer, {
          modelIssue: modelIssue ?? formatModelIssue(error),
        }),
      );
      await logger.write({ type: "assistant_final", content: answer });

      return {
        answer,
        usedTools: toolResults.map((result) => result.tool),
      };
    } finally {
      services.close();
    }
  }

  private async buildRoutePlan(
    userInput: string,
    services: Awaited<ReturnType<ReturnType<typeof createCommandRuntime>["createProjectServices"]>>,
  ): Promise<RoutePlan> {
    const modelSelection = selectModel(services.project.config, "light");
    const response = await services.llmClient.generate({
      provider: modelSelection.provider,
      model: modelSelection.model,
      temperature: 0.1,
      maxTokens: 700,
      messages: [
        {
          role: "system",
          content: [
            "你是 LoreCraft 的工具路由器。只输出 JSON，不要解释。",
            "可用工具：",
            "- project_status: 查看当前项目状态，args={}",
            "- list_files: 列出目录，args={\"path\":\".\"}",
            "- read_file: 读取项目内文本文件，args={\"path\":\"相对路径\"}",
            "- search_files: 搜索项目内文本文件，args={\"query\":\"关键词\"}",
            "- read_outline: 读取核心大纲文件，args={}",
            "",
            "输出格式：",
            "{\"tool_calls\":[{\"tool\":\"search_files\",\"args\":{\"query\":\"主角\"}}]}",
            "如果无需工具直接回答，则输出：{\"answer\":\"...\",\"tool_calls\":[]}",
            "不要调用写入类工具。不要暴露你的路由过程。",
          ].join("\n"),
        },
        { role: "user", content: userInput },
      ],
    });

    return parseRoutePlan(response.content);
  }

  private async buildFinalAnswer(
    userInput: string,
    routePlan: RoutePlan,
    toolResults: ToolResult[],
    services: Awaited<ReturnType<ReturnType<typeof createCommandRuntime>["createProjectServices"]>>,
  ): Promise<string> {
    if (toolResults.length === 0 && routePlan.answer) {
      return routePlan.answer;
    }

    if (toolResults.length === 0) {
      return "我已经收到你的问题。当前没有需要读取的项目上下文；如果你想让我看某个文件，可以直接说文件名或路径。";
    }

    const modelSelection = selectModel(services.project.config, "light");
    const response = await services.llmClient.generate({
      provider: modelSelection.provider,
      model: modelSelection.model,
      temperature: 0.2,
      maxTokens: 1_600,
      messages: [
        {
          role: "system",
          content: [
            "你是 LoreCraft，一个中文小说写作项目的终端 agent。",
            "根据工具结果回答用户。不要提到内部工具名、路由过程或日志。",
            "如果工具结果不足，直接说明缺什么。",
            "回答要清晰、简洁、面向写作者。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `用户问题：${userInput}`,
            "",
            "工具结果：",
            JSON.stringify(toolResults, null, 2).slice(0, 12_000),
          ].join("\n"),
        },
      ],
    });

    return response.content.trim();
  }
}

function parseRoutePlan(content: string): RoutePlan {
  const json = extractJson(content);
  if (!json) {
    throw new LLMProviderError("Router did not return JSON.", "router", false);
  }

  const parsed = JSON.parse(json) as RoutePlan;
  if (!Array.isArray(parsed.tool_calls)) {
    return { ...parsed, tool_calls: [] };
  }

  return parsed;
}

function extractJson(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = /\{[\s\S]*\}/u.exec(trimmed);
  return match?.[0] ?? null;
}

function normalizeToolCalls(calls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  const normalized: ToolCall[] = [];

  for (const call of calls) {
    if (!call.tool || typeof call.tool !== "string") {
      continue;
    }

    const key = `${call.tool}:${JSON.stringify(call.args ?? {})}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({
      tool: call.tool,
      args: call.args ?? {},
    });
  }

  return normalized;
}

function buildHeuristicRoutePlan(userInput: string): RoutePlan {
  const lower = userInput.toLowerCase();
  const mentionedFile = extractMentionedFile(userInput);

  if (mentionedFile) {
    return {
      tool_calls: [
        { tool: "search_files", args: { query: mentionedFile } },
        ...(mentionedFile.includes(".") ? [{ tool: "read_file", args: { path: mentionedFile } }] : []),
      ],
    };
  }

  if (lower.includes("状态") || lower.includes("项目") || lower.includes("check")) {
    return { tool_calls: [{ tool: "project_status", args: {} }] };
  }

  if (lower.includes("大纲") || lower.includes("outline")) {
    return { tool_calls: [{ tool: "read_outline", args: {} }] };
  }

  if (lower.includes("文件夹") || lower.includes("目录") || lower.includes("有哪些文件") || lower.includes("list")) {
    return { tool_calls: [{ tool: "list_files", args: { path: "." } }] };
  }

  if (lower.includes("读取") || lower.includes("看看") || lower.includes("看一下") || lower.includes("文件")) {
    return { tool_calls: [{ tool: "search_files", args: { query: extractSearchQuery(userInput) } }] };
  }

  return {
    tool_calls: [{ tool: "search_files", args: { query: extractSearchQuery(userInput) } }],
  };
}

function extractMentionedFile(input: string): string | null {
  const markdownPath = /([\w./\\\-\u4e00-\u9fa5]+\.md)/iu.exec(input)?.[1];
  if (markdownPath) {
    return markdownPath.replaceAll("\\", "/");
  }

  const txtPath = /([\w./\\\-\u4e00-\u9fa5]+\.txt)/iu.exec(input)?.[1];
  if (txtPath) {
    return txtPath.replaceAll("\\", "/");
  }

  const namedFile = /([a-zA-Z0-9_.-]{3,})\s*(?:文件|檔案|file)/iu.exec(input)?.[1];
  if (namedFile) {
    return namedFile;
  }

  return null;
}

function extractSearchQuery(input: string): string {
  const mentionedFile = extractMentionedFile(input);
  if (mentionedFile) {
    return mentionedFile;
  }

  return input
    .replace(/看一下|看看|读取|打开|总结|文件|这是|文风/gu, " ")
    .replace(/[，。,.]/gu, " ")
    .trim()
    .split(/\s+/u)
    .sort((left, right) => right.length - left.length)[0] ?? input;
}

function formatFallbackAnswer(
  userInput: string,
  toolResults: ToolResult[],
  directAnswer?: string,
  options: FallbackAnswerOptions = {},
): string {
  if (directAnswer && toolResults.length === 0) {
    return directAnswer;
  }

  const modelNotice = options.modelIssue ? [`当前模型不可用，已先使用本地项目检索回答。原因：${options.modelIssue}`, ""] : [];

  if (toolResults.length === 0) {
    return [
      ...modelNotice,
      "我没有找到足够的项目上下文来回答。你可以直接告诉我要看的文件名、章节名或设定关键词。",
    ].join("\n");
  }

  const successful = toolResults.filter((result) => result.status === "success");
  if (successful.length === 0) {
    return [
      ...modelNotice,
      `我尝试读取项目上下文，但没有成功：${toolResults.map((result) => result.error).filter(Boolean).join("；")}`,
    ].join("\n");
  }

  const nonEmpty = successful.filter((result) => !isEmptyToolResult(result.result));
  if (nonEmpty.length === 0) {
    return [
      ...modelNotice,
      "我没有在当前项目里找到匹配内容。",
      "",
      "你可以尝试：",
      "- 输入更准确的文件名或相对路径",
      "- 先让我“列一下当前目录文件”",
      "- 确认这个文件已经放在当前 LoreCraft 项目目录下",
    ].join("\n");
  }

  return [
    ...modelNotice,
    "我读取了相关项目上下文，摘要如下：",
    "",
    ...nonEmpty.map((result) => `- ${summarizeToolResult(result)}`),
    "",
    `你的问题是：${userInput}`,
  ].join("\n");
}

function summarizeToolResult(result: ToolResult): string {
  if (Array.isArray(result.result)) {
    const entries = result.result
      .map((entry) => summarizeResultEntry(entry))
      .filter((entry): entry is string => Boolean(entry));
    if (entries.length > 0) {
      return entries.slice(0, 5).join("；");
    }
  }

  const directEntry = summarizeResultEntry(result.result);
  if (directEntry) {
    return directEntry;
  }

  const text = JSON.stringify(result.result, null, 2).replace(/\s+/gu, " ");
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function summarizeResultEntry(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const pathValue = typeof record.path === "string" ? record.path : null;
  const excerptValue = typeof record.excerpt === "string" ? record.excerpt : null;
  const contentValue = typeof record.content === "string" ? record.content : null;

  if (pathValue && contentValue) {
    return `${pathValue}：${truncate(contentValue.replace(/\s+/gu, " "), 500)}`;
  }

  if (pathValue && excerptValue) {
    return `${pathValue}：${truncate(excerptValue.replace(/\s+/gu, " "), 500)}`;
  }

  if (pathValue) {
    return pathValue;
  }

  return null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function isEmptyToolResult(result: unknown): boolean {
  return Array.isArray(result) && result.length === 0;
}

function formatModelIssue(error: unknown): string | undefined {
  if (error instanceof LLMProviderError) {
    if (error.message.includes("Unknown provider")) {
      return "还没有为当前项目配置可用模型或 API Key。请用 /model 配置一次。";
    }

    if (error.statusCode) {
      return `模型服务返回 ${error.statusCode}。请检查 API Key、模型名、额度或限流状态。`;
    }

    return "模型调用失败。请检查 /model 配置。";
  }

  if (error instanceof Error) {
    return "模型调用失败。请检查 /model 配置或网络连接。";
  }

  return undefined;
}

function isIdentityQuestion(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return ["你是谁", "你是什么", "who are you", "你能做什么"].some((item) => normalized.includes(item));
}
