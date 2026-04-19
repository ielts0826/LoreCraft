import fs from "node:fs/promises";
import path from "node:path";

import { ProjectManager } from "../core/project.js";
import { PATHS, projectPath } from "../shared/constants.js";
import { exists, readTextIfExists } from "../shared/utils.js";
import type { ProjectStatus } from "../shared/types.js";

export type TuiViewId = "dashboard" | "chat" | "memory" | "outline" | "tasks" | "conflicts" | "confirm" | "diff";

export interface CommandMessage {
  id: string;
  role: "system" | "user" | "assistant";
  title: string;
  body: string;
  timestamp: string;
}

export interface OutlineNode {
  id: string;
  kind: "volume" | "chapter";
  label: string;
}

export interface PendingTransactionInfo {
  id: string;
  state: string;
  description: string;
  updatedAt: string;
}

export interface ProjectSnapshot {
  directory: string;
  isProject: boolean;
  name: string;
  genre: string;
  status: ProjectStatus | null;
  openLoops: string[];
  contradictionPreview: string[];
  outlineNodes: OutlineNode[];
  pendingTransactions: PendingTransactionInfo[];
  commandHints: string[];
  problem: string | null;
}

export interface TaskItem {
  title: string;
  detail: string;
  tone: "neutral" | "success" | "danger";
}

export const viewOrder: readonly TuiViewId[] = [
  "dashboard",
  "chat",
  "memory",
  "outline",
  "tasks",
  "conflicts",
  "confirm",
  "diff",
];

export const viewLabels: Readonly<Record<TuiViewId, string>> = {
  dashboard: "仪表盘",
  chat: "对话",
  memory: "记忆",
  outline: "大纲",
  tasks: "任务",
  conflicts: "冲突",
  confirm: "确认",
  diff: "变更",
};

export async function readProjectSnapshot(
  directory: string,
  projectManager = new ProjectManager(),
): Promise<ProjectSnapshot> {
  try {
    const project = await projectManager.load(directory);
    const status = await projectManager.getStatus(project);

    return {
      directory,
      isProject: true,
      name: project.config.name,
      genre: project.config.genre,
      status,
      openLoops: await readBulletPreview(projectPath(directory, "openLoops"), 6),
      contradictionPreview: await readHeadingPreview(projectPath(directory, "contradictionLog"), 5),
      outlineNodes: await readOutlineNodes(directory),
      pendingTransactions: await readPendingTransactions(directory),
      commandHints: buildCommandHints(status),
      problem: null,
    };
  } catch (error) {
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
      commandHints: [
        "/init <name> 初始化项目",
        "/open <目录> 重新指定目录",
        "/help 查看支持命令",
      ],
      problem: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildTaskItems(snapshot: ProjectSnapshot, messages: CommandMessage[]): TaskItem[] {
  if (!snapshot.isProject || snapshot.status === null) {
    return [
      { title: "初始化工程", detail: "当前目录还不是 LoreCraft 项目，可先执行 /init。", tone: "danger" },
      { title: "加载项目目录", detail: "或用 `lorecraft tui -d <项目路径>` 进入已有项目。", tone: "neutral" },
    ];
  }

  const items: TaskItem[] = [];
  if (snapshot.status.totalChaptersPlanned === 0) {
    items.push({ title: "补章节简报", detail: "还没有 `chapter_briefs`，建议先建立第一卷章节骨架。", tone: "danger" });
  }

  if (snapshot.openLoops.length > 0) {
    items.push({
      title: "回收伏笔",
      detail: `当前有 ${snapshot.openLoops.length} 条未回收伏笔，可以先做 /check 或 /write。`,
      tone: "neutral",
    });
  }

  if (snapshot.status.pendingConfirmations > 0) {
    items.push({
      title: "处理待确认项",
      detail: `审校/抽取留下 ${snapshot.status.pendingConfirmations} 条待确认记录。`,
      tone: "danger",
    });
  }

  if (messages.length > 0) {
    items.push({
      title: "继续当前会话",
      detail: `最近一条消息来自 ${messages.at(-1)?.role === "user" ? "你" : "系统"}，可以在对话页继续。`,
      tone: "success",
    });
  }

  if (items.length === 0) {
    items.push({
      title: "项目状态平稳",
      detail: "当前没有明显阻塞，可以直接在对话页输入 /write、/lookup 或 /plan。",
      tone: "success",
    });
  }

  return items;
}

function buildCommandHints(status: ProjectStatus): string[] {
  const hints = [
    "/help",
    "/status",
    "/lookup 主角",
  ];

  if (status.totalChaptersPlanned > 0) {
    hints.push(`/write ch${String(Math.max(status.currentChapter, 1)).padStart(3, "0")}`);
  } else {
    hints.push("/plan 一个关于王朝崩塌的故事");
  }

  return hints;
}

async function readOutlineNodes(root: string): Promise<OutlineNode[]> {
  const nodes: OutlineNode[] = [];

  const volumePlans = await readMarkdownNames(projectPath(root, "volumePlans"));
  for (const fileName of volumePlans) {
    nodes.push({
      id: fileName,
      kind: "volume",
      label: `卷纲 ${fileName.replace(/\.md$/u, "")}`,
    });
  }

  const chapterBriefs = await readMarkdownNames(projectPath(root, "chapterBriefs"));
  for (const fileName of chapterBriefs.slice(0, 20)) {
    nodes.push({
      id: fileName,
      kind: "chapter",
      label: `章节 ${fileName.replace(/\.md$/u, "")}`,
    });
  }

  return nodes;
}

async function readPendingTransactions(root: string): Promise<PendingTransactionInfo[]> {
  const transactionsRoot = path.join(root, PATHS.transactions);
  if (!(await exists(transactionsRoot))) {
    return [];
  }

  const entries = await fs.readdir(transactionsRoot, { withFileTypes: true });
  const transactions: PendingTransactionInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const status = await readTextIfExists(path.join(transactionsRoot, entry.name, "status.json"));
    if (!status) {
      continue;
    }

    const parsed = JSON.parse(status) as { state?: string; description?: string; updatedAt?: string };
    transactions.push({
      id: entry.name,
      state: parsed.state ?? "unknown",
      description: parsed.description ?? "未命名事务",
      updatedAt: parsed.updatedAt ?? "unknown",
    });
  }

  return transactions
    .filter((item) => item.state === "planning" || item.state === "staging" || item.state === "failed")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function readMarkdownNames(directory: string): Promise<string[]> {
  if (!(await exists(directory))) {
    return [];
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

async function readBulletPreview(filePath: string, limit: number): Promise<string[]> {
  const content = await readTextIfExists(filePath);
  if (!content) {
    return [];
  }

  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .slice(0, limit)
    .map((line) => line.replace(/^- /u, ""));
}

async function readHeadingPreview(filePath: string, limit: number): Promise<string[]> {
  const content = await readTextIfExists(filePath);
  if (!content) {
    return [];
  }

  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## "))
    .slice(0, limit)
    .map((line) => line.replace(/^## /u, ""));
}

