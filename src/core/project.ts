import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_TEXT_FILES, PROJECT_DIRECTORIES, projectPath } from "../shared/constants.js";
import type { ProjectPathKey } from "../shared/constants.js";
import { ProjectError } from "../shared/errors.js";
import type { CreateProjectOptions, LastSessionInfo, Project, ProjectStatus } from "../shared/types.js";
import { ensureDir, exists, parseNumericSuffix, readTextIfExists, sanitizeProjectDirName } from "../shared/utils.js";
import { createDefaultConfig, projectConfigExists, readProjectConfig } from "./config.js";
import { eventBus } from "./event-bus.js";
import { SessionManager } from "../session/manager.js";
import { TransactionManager } from "./transaction.js";

export class ProjectManager {
  public constructor(
    private readonly transactions = new TransactionManager(),
    private readonly sessions = new SessionManager(),
  ) {}

  public async create(name: string, options: CreateProjectOptions = {}): Promise<Project> {
    const baseDir = options.baseDir ?? process.cwd();
    const root = options.inPlace ? baseDir : path.join(baseDir, sanitizeProjectDirName(name));

    await ensureDir(root);
    await this.assertSingleBook(root);

    for (const directoryKey of PROJECT_DIRECTORIES) {
      await ensureDir(projectPath(root, directoryKey));
    }

    const transaction = await this.transactions.begin(root, `Initialize project ${name}`);
    const config = createDefaultConfig(name, options.genre);

    await transaction.stage(projectPath(root, "config"), formatConfigYaml(config), "create project config");

    const seedFiles: ProjectPathKey[] = [
      "proseStyle",
      "povRules",
      "tabooList",
      "openLoops",
      "resolvedLoops",
      "contradictionLog",
      "premise",
      "masterOutline",
      "timeline",
      "glossary",
    ];

    for (const pathKey of seedFiles) {
      const content = DEFAULT_TEXT_FILES[pathKey];
      await transaction.stage(projectPath(root, pathKey), content, `seed ${pathKey}`);
    }

    await transaction.commit();
    return this.load(root);
  }

  public async load(root: string): Promise<Project> {
    const configPath = projectPath(root, "config");
    if (!(await exists(configPath))) {
      throw new ProjectError("当前目录不是 LoreCraft 项目，请先执行 init。");
    }

    await this.transactions.recoverStale(root);
    const config = await readProjectConfig(root);
    const project: Project = { root, config };
    await this.sessions.loadLastSummary(project);

    const status = await this.getStatus(project);
    eventBus.emit("project:loaded", { status });
    return project;
  }

  public async getStatus(project: Project): Promise<ProjectStatus> {
    const currentVolume = await this.detectCurrentVolume(project.root);
    const currentChapter = await this.detectCurrentChapter(project.root, currentVolume);
    const totalChaptersPlanned = await this.countChapterBriefs(project.root);
    const canonStats = await this.collectCanonStats(project.root);
    const openForeshadowing = await this.countMarkdownListItems(projectPath(project.root, "openLoops"));
    const pendingConfirmations = await this.countPendingConfirmations(project.root);
    const lastSessionSummary = await this.sessions.getLatestSummary(project.root);
    const lastSession: LastSessionInfo | null = lastSessionSummary
      ? {
          date: new Date(lastSessionSummary.date),
          headline: lastSessionSummary.headline,
          summary: lastSessionSummary.fullSummary,
        }
      : null;

    return {
      currentVolume,
      currentChapter,
      totalChaptersPlanned,
      canonStats,
      openForeshadowing,
      pendingConfirmations,
      lastSession,
    };
  }

  public async assertSingleBook(dirPath: string): Promise<void> {
    const configExists = await projectConfigExists(dirPath);
    if (!configExists) {
      return;
    }

    throw new ProjectError(`当前目录已是 LoreCraft 项目：${dirPath}`);
  }

  private async detectCurrentVolume(root: string): Promise<number> {
    const volumesRoot = projectPath(root, "volumes");
    if (!(await exists(volumesRoot))) {
      return 0;
    }

    const entries = await fs.readdir(volumesRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .reduce((max, entry) => Math.max(max, parseNumericSuffix(entry.name, "vol_")), 0);
  }

  private async detectCurrentChapter(root: string, currentVolume: number): Promise<number> {
    if (currentVolume <= 0) {
      return 0;
    }

    const volumePath = path.join(projectPath(root, "volumes"), `vol_${String(currentVolume).padStart(2, "0")}`);
    if (!(await exists(volumePath))) {
      return 0;
    }

    const entries = await fs.readdir(volumePath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .reduce((max, entry) => Math.max(max, parseNumericSuffix(entry.name.replace(".md", ""), "ch_")), 0);
  }

  private async countChapterBriefs(root: string): Promise<number> {
    const briefsRoot = projectPath(root, "chapterBriefs");
    if (!(await exists(briefsRoot))) {
      return 0;
    }

    const entries = await fs.readdir(briefsRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
  }

  private async collectCanonStats(root: string): Promise<ProjectStatus["canonStats"]> {
    const characters = await countMarkdownFiles(projectPath(root, "characters"));
    const locations = await countMarkdownFiles(projectPath(root, "locations"));
    const factions = await countMarkdownFiles(projectPath(root, "factions"));
    const world = await countMarkdownFiles(projectPath(root, "world"));

    return {
      characters,
      locations,
      factions,
      totalEntities: characters + locations + factions + world,
    };
  }

  private async countMarkdownListItems(filePath: string): Promise<number> {
    const content = await readTextIfExists(filePath);
    if (content === null) {
      return 0;
    }

    return content
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- ") || /^\d+\.\s/iu.test(line))
      .length;
  }

  private async countPendingConfirmations(root: string): Promise<number> {
    const auditRoot = projectPath(root, "audit");
    if (!(await exists(auditRoot))) {
      return 0;
    }

    const entries = await fs.readdir(auditRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length;
  }
}

async function countMarkdownFiles(directory: string): Promise<number> {
  if (!(await exists(directory))) {
    return 0;
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += await countMarkdownFiles(absolutePath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      count += 1;
    }
  }

  return count;
}

function formatConfigYaml(config: Project["config"]): string {
  return [
    "schemaVersion: 1",
    `name: ${JSON.stringify(config.name)}`,
    `genre: ${JSON.stringify(config.genre)}`,
    `creativeMode: ${config.creativeMode}`,
    "models:",
    `  writer:\n    provider: ${config.models.writer.provider}\n    modelId: ${config.models.writer.modelId}\n    apiKeyEnv: ${config.models.writer.apiKeyEnv ?? "OPENROUTER_API_KEY"}`,
    `  reviewer:\n    provider: ${config.models.reviewer.provider}\n    modelId: ${config.models.reviewer.modelId}\n    apiKeyEnv: ${config.models.reviewer.apiKeyEnv ?? "OPENROUTER_API_KEY"}`,
    `  extractor:\n    provider: ${config.models.extractor.provider}\n    modelId: ${config.models.extractor.modelId}\n    apiKeyEnv: ${config.models.extractor.apiKeyEnv ?? "OPENROUTER_API_KEY"}`,
    `  light:\n    provider: ${config.models.light.provider}\n    modelId: ${config.models.light.modelId}\n    apiKeyEnv: ${config.models.light.apiKeyEnv ?? "OPENROUTER_API_KEY"}`,
    `  embedding:\n    provider: ${config.models.embedding.provider}\n    modelId: ${config.models.embedding.modelId}\n    dimension: ${config.models.embedding.dimension}\n    apiKeyEnv: ${config.models.embedding.apiKeyEnv ?? "SILICONFLOW_API_KEY"}`,
    "style: {}",
    "sandbox:",
    `  mode: ${config.sandbox.mode}`,
    `  allowNetwork: ${config.sandbox.allowNetwork}`,
    "",
  ].join("\n");
}
