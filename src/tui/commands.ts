import path from "node:path";

import { createCommandRuntime } from "../cli/runtime.js";
import {
  analyzeStyle,
  commitTransaction,
  expandOutline,
  formatReviewReport,
  formatTransactionHistory,
  getProjectStatus,
  getTransactionDiff,
  initializeProject,
  listTransactions,
  lookupKnowledge,
  planStory,
  reviewChapter,
  rollbackTransaction,
  writeChapter,
} from "../cli/workflows.js";
import { getModelConfigurationSummary, setModelBinding, testModelConnection } from "../cli/model-workflows.js";
import { ProjectManager } from "../core/project.js";
import type { TextModelRole } from "../shared/types.js";
import { viewOrder, type ProjectSnapshot, type TuiViewId } from "./model.js";

export interface TuiCommandSpec {
  name: string;
  synopsis: string;
  description: string;
  template: string;
  keywords: string[];
  requiresArguments?: boolean | undefined;
}

export interface TuiCommandExecutionContext {
  projectDir: string;
  snapshot: ProjectSnapshot | null;
  runtime?: ReturnType<typeof createCommandRuntime>;
  projectManager?: ProjectManager;
}

export interface TuiCommandExecutionResult {
  title: string;
  body: string;
  nextView?: TuiViewId | undefined;
  nextDirectory?: string | undefined;
  clearHistory?: boolean | undefined;
}

const defaultRuntime = createCommandRuntime();
const defaultProjectManager = new ProjectManager();
const modelRoles: readonly TextModelRole[] = ["writer", "reviewer", "extractor", "light"];

export const tuiCommandSpecs: readonly TuiCommandSpec[] = [
  {
    name: "/help",
    synopsis: "/help",
    description: "查看所有命令和快捷用法",
    template: "/help",
    keywords: ["manual", "docs"],
  },
  {
    name: "/status",
    synopsis: "/status",
    description: "读取当前项目状态摘要",
    template: "/status",
    keywords: ["project", "summary"],
  },
  {
    name: "/lookup",
    synopsis: "/lookup <关键词>",
    description: "检索设定、章节与连续性上下文",
    template: "/lookup 主角",
    keywords: ["search", "canon", "memory"],
    requiresArguments: true,
  },
  {
    name: "/write",
    synopsis: "/write <chapter> [--brief 文本]",
    description: "生成指定章节并直接落盘",
    template: "/write ch001",
    keywords: ["draft", "chapter", "generate"],
    requiresArguments: true,
  },
  {
    name: "/check",
    synopsis: "/check [chapter]",
    description: "审查章节的一致性和连续性",
    template: "/check ch001",
    keywords: ["review", "consistency"],
  },
  {
    name: "/plan",
    synopsis: "/plan <故事点子>",
    description: "生成最小可行的大纲规划",
    template: "/plan 一个王朝崩塌后的悬疑修仙故事",
    keywords: ["outline", "idea"],
    requiresArguments: true,
  },
  {
    name: "/expand",
    synopsis: "/expand <outlineFile>",
    description: "基于卷纲补齐增量扩展计划",
    template: "/expand story_bible/outlines/volume_plans/vol01.md",
    keywords: ["outline", "volume"],
    requiresArguments: true,
  },
  {
    name: "/style analyze",
    synopsis: "/style analyze <referenceFile> [--apply]",
    description: "分析参考文风，并可生成待确认的风格事务",
    template: "/style analyze manuscript/volumes/vol_01/ch_001.md",
    keywords: ["style", "voice", "analyze"],
    requiresArguments: true,
  },
  {
    name: "/model",
    synopsis: "/model",
    description: "查看当前项目的角色模型绑定和配置方式",
    template: "/model",
    keywords: ["provider", "model", "key", "base-url"],
  },
  {
    name: "/model set",
    synopsis: "/model set <role> <provider> <modelId> [--base-url URL] [--api-key KEY] [--credential ID] [--test]",
    description: "为 writer/reviewer/extractor/light 绑定模型连接",
    template: "/model set writer openai-compatible moonshot-v1-8k --base-url https://api.moonshot.cn/v1 --api-key <key> --test",
    keywords: ["provider", "model", "api", "bind", "kimi", "glm"],
    requiresArguments: true,
  },
  {
    name: "/model test",
    synopsis: "/model test <role>",
    description: "测试某个角色当前模型连接是否可用",
    template: "/model test writer",
    keywords: ["provider", "model", "ping", "connection"],
    requiresArguments: true,
  },
  {
    name: "/history",
    synopsis: "/history",
    description: "列出最近的事务记录",
    template: "/history",
    keywords: ["transaction", "timeline"],
  },
  {
    name: "/diff",
    synopsis: "/diff [txnId]",
    description: "查看某个事务的差异预览",
    template: "/diff",
    keywords: ["transaction", "preview"],
  },
  {
    name: "/commit",
    synopsis: "/commit [txnId]",
    description: "提交事务",
    template: "/commit",
    keywords: ["transaction", "apply"],
  },
  {
    name: "/rollback",
    synopsis: "/rollback [txnId]",
    description: "回滚事务",
    template: "/rollback",
    keywords: ["transaction", "cancel"],
  },
  {
    name: "/view",
    synopsis: "/view <dashboard|chat|memory|outline|tasks|conflicts|confirm|diff>",
    description: "切换工作台视图",
    template: "/view chat",
    keywords: ["screen", "tab"],
    requiresArguments: true,
  },
  {
    name: "/open",
    synopsis: "/open <目录>",
    description: "切换到另一个项目目录",
    template: "/open .",
    keywords: ["directory", "folder", "project"],
    requiresArguments: true,
  },
  {
    name: "/init",
    synopsis: "/init <名称> [--genre 类型]",
    description: "在当前目录下初始化新项目",
    template: "/init 我的故事",
    keywords: ["create", "bootstrap"],
    requiresArguments: true,
  },
  {
    name: "/clear",
    synopsis: "/clear",
    description: "清空当前对话记录",
    template: "/clear",
    keywords: ["reset", "chat"],
  },
];

export function filterTuiCommands(input: string): TuiCommandSpec[] {
  if (!input.startsWith("/")) {
    return [];
  }

  const query = input.slice(1).trim().toLowerCase();
  if (!query) {
    return [...tuiCommandSpecs];
  }

  return tuiCommandSpecs.filter((command) => {
    const haystack = [command.name, command.synopsis, command.description, command.template, ...command.keywords]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function tokenizeCommandLine(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of input.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/u.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export function shouldAutocompleteCommandInput(input: string, selected: TuiCommandSpec | undefined): boolean {
  if (!selected || !input.startsWith("/")) {
    return false;
  }

  const trimmed = input.trim();
  if (trimmed === "/") {
    return true;
  }

  const tokens = tokenizeCommandLine(trimmed);
  const currentCommand = tokens.slice(0, Math.min(tokens.length, 2)).join(" ").toLowerCase();
  if (currentCommand !== selected.name && tokens[0]?.toLowerCase() !== selected.name) {
    return true;
  }

  if (selected.requiresArguments && tokens.length <= selected.name.split(" ").length) {
    return true;
  }

  return trimmed !== selected.template && tokens.length <= selected.name.split(" ").length;
}

export async function executeTuiInput(
  {
    projectDir,
    snapshot,
    runtime = defaultRuntime,
    projectManager = defaultProjectManager,
  }: TuiCommandExecutionContext,
  input: string,
): Promise<TuiCommandExecutionResult> {
  const trimmed = input.trim();

  if (!trimmed) {
    return {
      title: "空输入",
      body: "请输入命令或写作意图。",
    };
  }

  if (!trimmed.startsWith("/")) {
    if (!snapshot?.isProject) {
      return {
        title: "未加载项目",
        body: "当前目录还不是 LoreCraft 项目。先执行 /init <name>，再继续写作。",
      };
    }

    const services = await runtime.createProjectServices(projectDir);
    try {
      const plan = services.orchestratorAgent.analyzeIntent(`/plan ${trimmed}`);
      return {
        title: "意图分析",
        body: [
          `识别意图：${plan.intent}`,
          `建议模块：${plan.modules.join(" / ")}`,
          `需要上下文：${plan.requiredContext.join("、")}`,
          `风险等级：${plan.riskLevel}`,
          `是否需要确认：${plan.needsConfirmation ? "是" : "否"}`,
        ].join("\n"),
        nextView: "chat",
      };
    } finally {
      services.close();
    }
  }

  const tokens = tokenizeCommandLine(trimmed);
  const command = detectCommand(tokens);
  const { positionals, flags } = parseOptionTokens(tokens.slice(command.tokenCount));

  switch (command.name) {
    case "/help":
      return {
        title: "命令手册",
        body: [
          "输入 `/` 会弹出命令下拉面板，可用上下方向键切换，Tab 自动补全。",
          "",
          ...tuiCommandSpecs.map((item) => `${item.synopsis}\n  ${item.description}`),
        ].join("\n"),
        nextView: "chat",
      };

    case "/clear":
      return {
        title: "会话已清空",
        body: "已重置当前对话记录。",
        clearHistory: true,
        nextView: "chat",
      };

    case "/view": {
      const requested = positionals[0] as TuiViewId | undefined;
      if (!requested || !viewOrder.includes(requested)) {
        return {
          title: "命令缺参数",
          body: "用法：/view <dashboard|chat|memory|outline|tasks|conflicts|confirm|diff>",
        };
      }

      return {
        title: "视图切换",
        body: `已切换到 ${requested} 视图。`,
        nextView: requested,
      };
    }

    case "/open": {
      const target = positionals.join(" ").trim();
      if (!target) {
        return {
          title: "命令缺参数",
          body: "用法：/open <目录>",
        };
      }

      const resolved = path.resolve(projectDir, target);
      return {
        title: "目录已切换",
        body: `已将工作目录切换到：${resolved}`,
        nextDirectory: resolved,
        nextView: "dashboard",
      };
    }

    case "/init": {
      const name = positionals.join(" ").trim();
      if (!name) {
        return {
          title: "命令缺参数",
          body: "用法：/init <名称> [--genre 类型]",
        };
      }

      const project = await initializeProject(
        name,
        {
          baseDir: projectDir,
          genre: typeof flags.genre === "string" ? flags.genre : undefined,
          inPlace: flags["in-place"] === true,
        },
        projectManager,
      );

      return {
        title: "项目已创建",
        body: `已创建项目 ${project.config.name}\n路径：${project.root}`,
        nextDirectory: project.root,
        nextView: "dashboard",
      };
    }

    case "/status": {
      assertProjectLoaded(snapshot);
      const status = await getProjectStatus(projectDir, projectManager);
      return {
        title: "项目状态",
        body: status.summary,
        nextView: "dashboard",
      };
    }

    case "/lookup": {
      assertProjectLoaded(snapshot);
      const query = positionals.join(" ").trim();
      if (!query) {
        return {
          title: "命令缺参数",
          body: "用法：/lookup <关键词>",
        };
      }

      const output = await lookupKnowledge(projectDir, query, { limit: readNumericFlag(flags.limit, 5) }, runtime);
      return {
        title: "检索结果",
        body: output,
        nextView: "memory",
      };
    }

    case "/check": {
      assertProjectLoaded(snapshot);
      const report = await reviewChapter(
        projectDir,
        positionals[0],
        {
          provider: readStringFlag(flags.provider),
          model: readStringFlag(flags.model),
        },
        runtime,
      );
      return {
        title: "章节审查",
        body: formatReviewReport(report),
        nextView: "conflicts",
      };
    }

    case "/write": {
      assertProjectLoaded(snapshot);
      const chapter = positionals[0];
      if (!chapter) {
        return {
          title: "命令缺参数",
          body: "用法：/write <chapter> [--brief 文本] [--brief-file 文件] [--volume 1]",
        };
      }

      const result = await writeChapter(
        projectDir,
        chapter,
        {
          brief: readStringFlag(flags.brief),
          briefFile: readStringFlag(flags["brief-file"]),
          volume: readStringFlag(flags.volume),
          provider: readStringFlag(flags.provider),
          model: readStringFlag(flags.model),
        },
        runtime,
      );
      return {
        title: "章节已写入",
        body: [`路径：${result.outputPath}`, "", excerpt(result.content, 320)].join("\n"),
        nextView: "diff",
      };
    }

    case "/plan": {
      assertProjectLoaded(snapshot);
      const description = positionals.join(" ").trim();
      if (!description) {
        return {
          title: "命令缺参数",
          body: "用法：/plan <故事点子>",
        };
      }

      const output = await planStory(
        projectDir,
        description,
        {
          provider: readStringFlag(flags.provider),
          model: readStringFlag(flags.model),
        },
        runtime,
      );
      return {
        title: "规划结果",
        body: output,
        nextView: "outline",
      };
    }

    case "/expand": {
      assertProjectLoaded(snapshot);
      const outlineFile = positionals[0];
      if (!outlineFile) {
        return {
          title: "命令缺参数",
          body: "用法：/expand <outlineFile>",
        };
      }

      const output = await expandOutline(
        projectDir,
        outlineFile,
        {
          provider: readStringFlag(flags.provider),
          model: readStringFlag(flags.model),
        },
        runtime,
      );
      return {
        title: "扩展结果",
        body: output,
        nextView: "outline",
      };
    }

    case "/style analyze": {
      assertProjectLoaded(snapshot);
      const referenceFile = positionals[0];
      if (!referenceFile) {
        return {
          title: "命令缺参数",
          body: "用法：/style analyze <referenceFile> [--apply]",
        };
      }

      const result = await analyzeStyle(
        projectDir,
        referenceFile,
        {
          apply: flags.apply === true,
          provider: readStringFlag(flags.provider),
          model: readStringFlag(flags.model),
        },
        runtime,
      );

      return {
        title: result.transactionId ? "文风分析已暂存" : "文风分析结果",
        body: result.transactionId
          ? [
              result.analysis,
              "",
              `已生成待确认事务：${result.transactionId}`,
              `涉及文件：${result.stagedFiles.join("、")}`,
              "可继续执行 /diff 查看差异，或 /commit 提交。",
            ].join("\n")
          : result.analysis,
        nextView: result.transactionId ? "confirm" : "memory",
      };
    }

    case "/model": {
      assertProjectLoaded(snapshot);
      return {
        title: "模型绑定",
        body: await getModelConfigurationSummary(projectDir, projectManager, runtime.credentialStore),
        nextView: "chat",
      };
    }

    case "/model set": {
      assertProjectLoaded(snapshot);
      const role = positionals[0] as TextModelRole | undefined;
      const provider = positionals[1];
      const modelId = positionals[2];
      if (!role || !modelRoles.includes(role) || !provider || !modelId) {
        return {
          title: "命令缺参数",
          body: "用法：/model set <writer|reviewer|extractor|light> <provider> <modelId> [--base-url URL] [--api-key KEY] [--credential ID] [--test]",
        };
      }

      return {
        title: "模型已更新",
        body: await setModelBinding(
          projectDir,
          role,
          {
            provider,
            modelId,
            baseUrl: readStringFlag(flags["base-url"]),
            apiKey: readStringFlag(flags["api-key"]),
            credentialId: readStringFlag(flags.credential),
            test: flags.test === true,
          },
          projectManager,
          runtime.credentialStore,
        ),
        nextView: "chat",
      };
    }

    case "/model test": {
      assertProjectLoaded(snapshot);
      const role = positionals[0] as TextModelRole | undefined;
      if (!role || !modelRoles.includes(role)) {
        return {
          title: "命令缺参数",
          body: "用法：/model test <writer|reviewer|extractor|light>",
        };
      }

      return {
        title: "连接测试",
        body: await testModelConnection(projectDir, role, projectManager, runtime.credentialStore),
        nextView: "chat",
      };
    }

    case "/history": {
      assertProjectLoaded(snapshot);
      const records = await listTransactions(projectDir, { includeClosed: true });
      return {
        title: "事务历史",
        body: formatTransactionHistory(records),
        nextView: "diff",
      };
    }

    case "/diff": {
      assertProjectLoaded(snapshot);
      const result = await getTransactionDiff(projectDir, positionals[0]);
      return {
        title: "事务差异",
        body: result.formatted,
        nextView: "diff",
      };
    }

    case "/commit": {
      assertProjectLoaded(snapshot);
      const message = await commitTransaction(projectDir, positionals[0]);
      return {
        title: "事务已提交",
        body: message,
        nextView: "confirm",
      };
    }

    case "/rollback": {
      assertProjectLoaded(snapshot);
      const message = await rollbackTransaction(projectDir, positionals[0]);
      return {
        title: "事务已回滚",
        body: message,
        nextView: "confirm",
      };
    }

    default:
      return {
        title: "未知命令",
        body: [
          `未识别命令：${command.name}`,
          "",
          "可用命令：",
          ...tuiCommandSpecs.map((item) => `- ${item.synopsis}`),
        ].join("\n"),
      };
  }
}

function detectCommand(tokens: string[]): { name: string; tokenCount: number } {
  const twoToken = tokens.slice(0, 2).join(" ").toLowerCase();
  if (tuiCommandSpecs.some((command) => command.name === twoToken)) {
    return { name: twoToken, tokenCount: 2 };
  }

  return { name: tokens[0]?.toLowerCase() ?? "", tokenCount: 1 };
}

function parseOptionTokens(tokens: string[]): {
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const flagName = token.slice(2);
    const nextToken = tokens[index + 1];
    if (!nextToken || nextToken.startsWith("--")) {
      flags[flagName] = true;
      continue;
    }

    flags[flagName] = nextToken;
    index += 1;
  }

  return { positionals, flags };
}

function readStringFlag(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumericFlag(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function excerpt(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }

  return `${content.slice(0, maxLength)}...`;
}

function assertProjectLoaded(snapshot: ProjectSnapshot | null): asserts snapshot is ProjectSnapshot & { isProject: true } {
  if (!snapshot?.isProject) {
    throw new Error("当前目录还不是 LoreCraft 项目。先执行 /init <name>，再继续写作。");
  }
}
