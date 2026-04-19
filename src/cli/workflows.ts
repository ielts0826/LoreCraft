import fs from "node:fs/promises";
import path from "node:path";

import type { ReviewReport } from "../agents/reviewer.js";
import { ProjectManager } from "../core/project.js";
import { TransactionManager, type TransactionState } from "../core/transaction.js";
import { buildExpandPlannerPrompt } from "../llm/prompts/expand-planner.js";
import { buildStyleAnalyzerPrompt } from "../llm/prompts/style-analyzer.js";
import { PATHS, projectPath } from "../shared/constants.js";
import { ProjectError } from "../shared/errors.js";
import type { DiffResult, Manifest, Project } from "../shared/types.js";
import { exists, readJsonIfExists } from "../shared/utils.js";
import { createCommandRuntime, resolveChapterBrief, resolveChapterFile, resolveWriteOutputPath, selectModel } from "./runtime.js";

export interface WorkflowModelOverride {
  provider?: string | undefined;
  model?: string | undefined;
}

export interface InitWorkflowOptions {
  baseDir?: string | undefined;
  genre?: string | undefined;
  inPlace?: boolean | undefined;
}

export interface LookupWorkflowOptions {
  limit?: number | undefined;
}

export interface WriteWorkflowOptions extends WorkflowModelOverride {
  brief?: string | undefined;
  briefFile?: string | undefined;
  volume?: string | undefined;
}

export interface StyleAnalyzeWorkflowOptions extends WorkflowModelOverride {
  apply?: boolean | undefined;
}

export interface WriteWorkflowResult {
  outputPath: string;
  content: string;
}

export interface StatusWorkflowResult {
  name: string;
  root: string;
  summary: string;
}

export interface StyleAnalyzeWorkflowResult {
  analysis: string;
  transactionId?: string | undefined;
  stagedFiles: string[];
}

export interface TransactionRecord {
  id: string;
  state: TransactionState;
  description: string;
  updatedAt: string;
  operationCount: number;
  targets: string[];
}

export interface TransactionDiffWorkflowResult {
  record: TransactionRecord;
  formatted: string;
  diffs: DiffResult[];
}

export async function initializeProject(
  name: string,
  options: InitWorkflowOptions = {},
  projectManager = new ProjectManager(),
) {
  return projectManager.create(name, {
    ...(options.baseDir ? { baseDir: options.baseDir } : {}),
    ...(options.genre ? { genre: options.genre } : {}),
    ...(options.inPlace !== undefined ? { inPlace: options.inPlace } : {}),
  });
}

export async function getProjectStatus(
  directory: string,
  projectManager = new ProjectManager(),
): Promise<StatusWorkflowResult> {
  const project = await projectManager.load(path.resolve(directory));
  const status = await projectManager.getStatus(project);

  const lastSession = status.lastSession
    ? `${status.lastSession.date.toISOString().slice(0, 10)} ${status.lastSession.headline}`
    : "无";

  return {
    name: project.config.name,
    root: project.root,
    summary: [
      `项目：${project.config.name}`,
      `当前卷/章：第 ${status.currentVolume} 卷 / 第 ${status.currentChapter} 章`,
      `计划章节数：${status.totalChaptersPlanned}`,
      `Canon 实体：${status.canonStats.totalEntities}（人物 ${status.canonStats.characters} / 地点 ${status.canonStats.locations} / 势力 ${status.canonStats.factions}）`,
      `未回收伏笔：${status.openForeshadowing}`,
      `待确认项：${status.pendingConfirmations}`,
      `上次会话：${lastSession}`,
    ].join("\n"),
  };
}

export async function lookupKnowledge(
  directory: string,
  query: string,
  options: LookupWorkflowOptions = {},
  runtime = createCommandRuntime(),
): Promise<string> {
  const services = await runtime.createProjectServices(path.resolve(directory));
  try {
    const results = await services.retriever.search({
      text: query,
      maxResults: options.limit ?? 5,
      rules: [{ type: "canon_over_draft", weight: 1 }],
    });

    if (results.length === 0) {
      return "未找到相关结果。";
    }

    return results
      .flatMap((result, index) => [
        `${index + 1}. ${result.source}`,
        `   layer=${result.layer} category=${result.category} score=${result.score.toFixed(3)}`,
        `   ${truncate(result.content.replace(/\s+/gu, " ").trim(), 180)}`,
      ])
      .join("\n");
  } finally {
    services.close();
  }
}

export async function reviewChapter(
  directory: string,
  chapter: string | undefined,
  options: WorkflowModelOverride = {},
  runtime = createCommandRuntime(),
): Promise<ReviewReport> {
  const services = await runtime.createProjectServices(path.resolve(directory));
  try {
    const chapterFile = await resolveChapterFile(services.project.root, chapter);
    const chapterText = await fs.readFile(chapterFile, "utf8");
    const chapterId = path.basename(chapterFile, ".md");
    const context = await services.contextBuilder.buildReviewContext({
      chapterId,
      chapterText,
    });
    const modelSelection = selectModel(services.project.config, "reviewer", options);
    return services.reviewerAgent.reviewChapter({
      provider: modelSelection.provider,
      model: modelSelection.model,
      chapterId,
      context,
    });
  } finally {
    services.close();
  }
}

export async function writeChapter(
  directory: string,
  chapter: string,
  options: WriteWorkflowOptions = {},
  runtime = createCommandRuntime(),
): Promise<WriteWorkflowResult> {
  const services = await runtime.createProjectServices(path.resolve(directory));
  try {
    const chapterBrief = await loadChapterBrief(services.project.root, chapter, options);
    if (!chapterBrief) {
      throw new ProjectError("缺少章节简报。请使用 --brief / --brief-file，或先在 chapter_briefs 中准备对应文件。");
    }

    const volumeNumber = await resolveVolumeNumber(runtime, services.project, options.volume);
    const context = await services.contextBuilder.buildWriteContext({
      chapterId: chapter,
      chapterBrief,
      userIntent: `/write ${chapter}`,
    });
    const modelSelection = selectModel(services.project.config, "writer", options);
    const draft = await services.writerAgent.draftChapter({
      provider: modelSelection.provider,
      model: modelSelection.model,
      chapterId: chapter,
      chapterInstruction: `写 ${chapter}：${chapterBrief.trim()}`,
      context,
    });

    const outputPath = resolveWriteOutputPath(services.project.root, chapter, volumeNumber);
    const tx = await services.transactionManager.begin(services.project.root, `Write ${chapter}`);
    await tx.stage(outputPath, `${draft.content.trim()}\n`, `write chapter ${chapter}`);
    await tx.commit();

    return {
      outputPath,
      content: draft.content.trim(),
    };
  } finally {
    services.close();
  }
}

export async function planStory(
  directory: string,
  description: string,
  options: WorkflowModelOverride = {},
  runtime = createCommandRuntime(),
): Promise<string> {
  const services = await runtime.createProjectServices(path.resolve(directory));
  try {
    const modelSelection = selectModel(services.project.config, "writer", options);
    const canonSummary =
      (await services.store.listCanon())
        .slice(0, 50)
        .map((entry) => `- [${entry.category}] ${entry.name}`)
        .join("\n") || "当前没有 canon。";

    const response = await services.llmClient.generate({
      provider: modelSelection.provider,
      model: modelSelection.model,
      temperature: 0.4,
      maxTokens: 2_500,
      messages: [
        {
          role: "system",
          content: [
            "你是 LoreCraft 的规划引擎。",
            "请根据用户给出的故事点子，生成“最小可行规划”，只覆盖足够启动第一卷写作的内容。",
            "",
            "输出中文 markdown，必须包含：",
            "- 核心世界观框架",
            "- 故事主线",
            "- 分卷构想",
            "- 第一卷章节推进",
            "- 主角与核心配角",
            "- 后续待扩展空位",
            "",
            "已有 canon：",
            canonSummary,
          ].join("\n"),
        },
        { role: "user", content: description },
      ],
    });

    return response.content.trim();
  } finally {
    services.close();
  }
}

export async function expandOutline(
  directory: string,
  outlineFile: string,
  options: WorkflowModelOverride = {},
  runtime = createCommandRuntime(),
): Promise<string> {
  const services = await runtime.createProjectServices(path.resolve(directory));
  try {
    const outlinePath = path.resolve(services.project.root, outlineFile);
    const outlineText = await fs.readFile(outlinePath, "utf8");
    const canonSummary =
      (await services.store.listCanon())
        .slice(0, 100)
        .map((entry) => `- [${entry.category}] ${entry.name}`)
        .join("\n") || "当前没有 canon。";
    const openLoops = (await services.store.getOpenLoops())
      .map((loop) => `- [${loop.id}] ${loop.description} (${loop.plantedIn})`)
      .join("\n");
    const modelSelection = selectModel(services.project.config, "writer", options);
    const prompt = buildExpandPlannerPrompt({
      outlineText,
      existingCanon: canonSummary,
      openLoops,
    });
    const response = await services.llmClient.generate({
      provider: modelSelection.provider,
      model: modelSelection.model,
      temperature: 0.3,
      maxTokens: 2_500,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `请基于 ${path.basename(outlinePath)} 生成增量扩展计划。` },
      ],
    });

    return response.content.trim();
  } finally {
    services.close();
  }
}

export async function analyzeStyle(
  directory: string,
  referenceFile: string,
  options: StyleAnalyzeWorkflowOptions = {},
  runtime = createCommandRuntime(),
): Promise<StyleAnalyzeWorkflowResult> {
  const services = await runtime.createProjectServices(path.resolve(directory));
  try {
    const referencePath = path.resolve(services.project.root, referenceFile);
    const referenceText = await fs.readFile(referencePath, "utf8");
    const existingStyle = await services.store.getStyle();
    const existingStyleText = [existingStyle.proseStyle, existingStyle.povRules, existingStyle.tabooList]
      .filter(Boolean)
      .join("\n\n");
    const modelSelection = selectModel(services.project.config, "light", options);

    const response = await services.llmClient.generate({
      provider: modelSelection.provider,
      model: modelSelection.model,
      temperature: 0.2,
      maxTokens: 2_500,
      messages: [
        {
          role: "system",
          content: buildStyleAnalyzerPrompt({
            referenceText,
            existingStyle: existingStyleText,
          }),
        },
        {
          role: "user",
          content: `请分析参考文件 ${path.basename(referencePath)} 的文风，并整理成可执行的风格规格卡。`,
        },
      ],
    });

    const analysis = response.content.trim();
    if (!options.apply) {
      return {
        analysis,
        stagedFiles: [],
      };
    }

    const styleBundle = parseStyleBundle(analysis, existingStyle);
    const tx = await services.transactionManager.begin(
      services.project.root,
      `Apply style analysis from ${path.basename(referencePath)}`,
    );
    await tx.stage(projectPath(services.project.root, "proseStyle"), styleBundle.proseStyle, "update prose style");
    await tx.stage(projectPath(services.project.root, "povRules"), styleBundle.povRules, "update POV rules");
    await tx.stage(projectPath(services.project.root, "tabooList"), styleBundle.tabooList, "update taboo list");

    return {
      analysis,
      transactionId: tx.id,
      stagedFiles: [
        projectPath(services.project.root, "proseStyle"),
        projectPath(services.project.root, "povRules"),
        projectPath(services.project.root, "tabooList"),
      ],
    };
  } finally {
    services.close();
  }
}

export async function listTransactions(
  directory: string,
  options: { includeClosed?: boolean } = {},
): Promise<TransactionRecord[]> {
  const root = path.resolve(directory);
  const transactionsRoot = path.join(root, PATHS.transactions);
  if (!(await exists(transactionsRoot))) {
    return [];
  }

  const entries = await fs.readdir(transactionsRoot, { withFileTypes: true });
  const records: TransactionRecord[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const status = await readJsonIfExists<{ state: TransactionState; description: string; updatedAt: string }>(
      path.join(transactionsRoot, entry.name, "status.json"),
    );
    if (status === null) {
      continue;
    }

    if (!options.includeClosed && isClosedState(status.state)) {
      continue;
    }

    const manifest = await readJsonIfExists<Manifest>(path.join(transactionsRoot, entry.name, "manifest.json"));
    const operations = manifest?.operations ?? [];

    records.push({
      id: entry.name,
      state: status.state,
      description: status.description,
      updatedAt: status.updatedAt,
      operationCount: operations.length,
      targets: operations.map((operation) => operation.target),
    });
  }

  return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getTransactionDiff(
  directory: string,
  transactionId?: string,
  transactionManager = new TransactionManager(),
): Promise<TransactionDiffWorkflowResult> {
  const record = await resolveTransactionRecord(directory, transactionId);
  const transaction = await transactionManager.open(path.resolve(directory), record.id);
  const diffs = await transaction.getDiff();

  return {
    record,
    diffs,
    formatted: formatTransactionDiff(record, diffs),
  };
}

export async function commitTransaction(
  directory: string,
  transactionId?: string,
  transactionManager = new TransactionManager(),
): Promise<string> {
  const record = await resolveTransactionRecord(directory, transactionId);
  if (record.state === "committed") {
    return `事务 ${record.id} 已经提交，无需重复提交。`;
  }

  const transaction = await transactionManager.open(path.resolve(directory), record.id);
  await transaction.commit();
  return `已提交事务 ${record.id}：${transaction.description}`;
}

export async function rollbackTransaction(
  directory: string,
  transactionId?: string,
  transactionManager = new TransactionManager(),
): Promise<string> {
  const record = await resolveTransactionRecord(directory, transactionId);
  if (record.state === "rolled_back") {
    return `事务 ${record.id} 已经回滚，无需重复回滚。`;
  }

  const transaction = await transactionManager.open(path.resolve(directory), record.id);
  await transaction.rollback();
  return `已回滚事务 ${record.id}：${transaction.description}`;
}

export function formatReviewReport(report: ReviewReport): string {
  const issueLines =
    report.issues.length > 0
      ? report.issues.map((issue, index) =>
          [
            `${index + 1}. [${issue.severity}] ${issue.type}`,
            `   位置：${issue.location}`,
            `   问题：${issue.description}`,
            `   建议：${issue.suggestion}`,
            issue.canon_reference ? `   Canon：${issue.canon_reference}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        )
      : ["未发现明显一致性问题。"];

  return [
    `章节：${report.chapter}`,
    `角色一致性：${report.score.character_consistency}/10`,
    `时间线一致性：${report.score.timeline_consistency}/10`,
    `世界规则符合度：${report.score.world_rule_compliance}/10`,
    `剧情连贯性：${report.score.plot_coherence}/10`,
    "",
    "问题清单：",
    ...issueLines,
  ].join("\n");
}

export function formatTransactionHistory(records: TransactionRecord[]): string {
  if (records.length === 0) {
    return "当前没有事务记录。";
  }

  return records
    .map((record, index) =>
      [
        `${index + 1}. ${record.id}`,
        `   状态：${record.state} | 操作数：${record.operationCount}`,
        `   描述：${record.description}`,
        `   更新时间：${record.updatedAt}`,
        record.targets.length > 0 ? `   目标：${record.targets.slice(0, 3).join("，")}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

async function resolveTransactionRecord(directory: string, transactionId?: string): Promise<TransactionRecord> {
  const records = await listTransactions(directory, { includeClosed: true });
  if (records.length === 0) {
    throw new ProjectError("当前没有任何事务记录。");
  }

  if (transactionId) {
    const matched = records.find((record) => record.id === transactionId);
    if (!matched) {
      throw new ProjectError(`未找到事务: ${transactionId}`);
    }

    return matched;
  }

  const latestPending = records.find((record) => !isClosedState(record.state));
  return latestPending ?? records[0]!;
}

async function loadChapterBrief(
  projectRoot: string,
  chapterId: string,
  options: { brief?: string | undefined; briefFile?: string | undefined },
): Promise<string | null> {
  if (options.brief?.trim()) {
    return options.brief;
  }

  if (options.briefFile) {
    const resolved = path.resolve(projectRoot, options.briefFile);
    return fs.readFile(resolved, "utf8");
  }

  return resolveChapterBrief(projectRoot, chapterId);
}

async function resolveVolumeNumber(
  runtime: ReturnType<typeof createCommandRuntime>,
  project: Project,
  rawVolume?: string,
): Promise<number> {
  if (rawVolume) {
    const parsed = Number.parseInt(rawVolume, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ProjectError(`非法卷号: ${rawVolume}`);
    }

    return parsed;
  }

  const status = await runtime.projectManager.getStatus(project);
  return Math.max(status.currentVolume, 1);
}

function parseStyleBundle(
  analysis: string,
  existing: { proseStyle: string; povRules: string; tabooList: string },
): { proseStyle: string; povRules: string; tabooList: string } {
  const sections = {
    pov: extractMarkdownSection(analysis, "叙事视角"),
    density: extractMarkdownSection(analysis, "散文密度"),
    rhythm: extractMarkdownSection(analysis, "节奏控制"),
    dialogue: extractMarkdownSection(analysis, "对话风格"),
    description: extractMarkdownSection(analysis, "描写原则"),
    taboo: extractMarkdownSection(analysis, "禁忌清单"),
    sample: extractMarkdownSection(analysis, "参考样本"),
  };

  const proseSections = [
    ["散文密度", sections.density],
    ["节奏控制", sections.rhythm],
    ["对话风格", sections.dialogue],
    ["描写原则", sections.description],
    ["参考样本", sections.sample],
  ].filter((section) => section[1]);

  return {
    proseStyle:
      proseSections.length > 0
        ? ["# 文风规格", "", ...proseSections.flatMap(([title, content]) => [`## ${title}`, content ?? "", ""])].join("\n").trimEnd() + "\n"
        : existing.proseStyle,
    povRules: sections.pov ? `# POV 规则\n\n${sections.pov.trim()}\n` : existing.povRules,
    tabooList: sections.taboo ? `# 禁忌清单\n\n${sections.taboo.trim()}\n` : existing.tabooList,
  };
}

function extractMarkdownSection(markdown: string, title: string): string | null {
  const pattern = new RegExp(`##\\s+${escapeRegExp(title)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "u");
  const match = pattern.exec(markdown);
  return match?.[1]?.trim() ?? null;
}

function formatTransactionDiff(record: TransactionRecord, diffs: DiffResult[]): string {
  const lines = [
    `事务：${record.id}`,
    `状态：${record.state}`,
    `描述：${record.description}`,
    `操作数：${record.operationCount}`,
    "",
  ];

  if (diffs.length === 0) {
    lines.push("当前事务没有差异内容。");
    return lines.join("\n");
  }

  for (const [index, diff] of diffs.entries()) {
    lines.push(`${index + 1}. ${diff.target} [${diff.type}]`);
    if (diff.oldContent !== null) {
      lines.push(`   原内容：${summarizeText(diff.oldContent)}`);
    } else {
      lines.push("   原内容：<新建文件>");
    }
    if (diff.newContent !== null) {
      lines.push(`   新内容：${summarizeText(diff.newContent)}`);
    } else {
      lines.push("   新内容：<删除文件>");
    }
  }

  return lines.join("\n");
}

function summarizeText(content: string): string {
  const flat = content.replace(/\s+/gu, " ").trim();
  return truncate(flat, 140);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function isClosedState(state: TransactionState): boolean {
  return state === "committed" || state === "rolled_back";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
