import fs from "node:fs/promises";
import path from "node:path";

import { projectPath } from "../shared/constants.js";
import { ensureDir, readTextIfExists, sanitizeProjectDirName, writeTextAtomic } from "../shared/utils.js";
import {
  canonEntrySchema,
  contradictionEntrySchema,
  foreshadowingSchema,
  outlineSchema,
  styleBundleSchema,
  type CanonCategory,
  type CanonEntry,
  type ContradictionEntry,
  type Foreshadowing,
  type Outline,
  type OutlineType,
  type StyleBundle,
} from "./schema.js";

export interface SetCanonInput {
  content: string;
  tier: 1 | 2 | 3;
  metadata?: Record<string, unknown>;
}

export class FileMemoryStore {
  public constructor(public readonly projectRoot: string) {}

  public async getCanon(category: CanonCategory, name: string): Promise<CanonEntry | null> {
    const filePath = this.resolveCanonFilePath(category, name);
    const content = await readTextIfExists(filePath);
    if (content === null) {
      return null;
    }

    const stat = await fs.stat(filePath);
    return canonEntrySchema.parse({
      name: extractDisplayName(content, name),
      category,
      tier: 3,
      filePath,
      content,
      lastModified: stat.mtime,
      metadata: {},
    });
  }

  public async setCanon(category: CanonCategory, name: string, input: SetCanonInput): Promise<CanonEntry> {
    const filePath = this.resolveCanonFilePath(category, name);
    await ensureDir(path.dirname(filePath));
    await writeTextAtomic(filePath, input.content);
    const stat = await fs.stat(filePath);

    return canonEntrySchema.parse({
      name,
      category,
      tier: input.tier,
      filePath,
      content: input.content,
      lastModified: stat.mtime,
      metadata: input.metadata ?? {},
    });
  }

  public async deleteCanon(category: CanonCategory, name: string): Promise<void> {
    const filePath = this.resolveCanonFilePath(category, name);
    await fs.rm(filePath, { force: true });
  }

  public async listCanon(category?: CanonCategory): Promise<CanonEntry[]> {
    const directories = category ? [this.resolveCanonBaseDirectory(category)] : allCanonDirectories(this.projectRoot);
    const entries: CanonEntry[] = [];

    for (const directory of directories) {
      const categoryEntries = await this.walkMarkdownFiles(directory);
      entries.push(...categoryEntries);
    }

    return entries;
  }

  public async getOutline(type: OutlineType, id: string): Promise<Outline | null> {
    const filePath = this.resolveOutlinePath(type, id);
    const content = await readTextIfExists(filePath);
    if (content === null) {
      return null;
    }

    const stat = await fs.stat(filePath);
    return outlineSchema.parse({
      id,
      type,
      content,
      filePath,
      lastModified: stat.mtime,
    });
  }

  public async setOutline(type: OutlineType, id: string, content: string): Promise<Outline> {
    const filePath = this.resolveOutlinePath(type, id);
    await ensureDir(path.dirname(filePath));
    await writeTextAtomic(filePath, content);
    const stat = await fs.stat(filePath);

    return outlineSchema.parse({
      id,
      type,
      content,
      filePath,
      lastModified: stat.mtime,
    });
  }

  public async getOpenLoops(): Promise<Foreshadowing[]> {
    const content = (await readTextIfExists(projectPath(this.projectRoot, "openLoops"))) ?? "";
    return parseForeshadowings(content, "open");
  }

  public async addOpenLoop(loop: Foreshadowing): Promise<void> {
    const parsed = foreshadowingSchema.parse(loop);
    const filePath = projectPath(this.projectRoot, "openLoops");
    const current = (await readTextIfExists(filePath)) ?? "# 未回收伏笔\n";
    const next = `${current.trimEnd()}\n- [${parsed.id}] ${parsed.description} (${parsed.plantedIn})\n`;
    await writeTextAtomic(filePath, next);
  }

  public async resolveLoop(id: string, resolution: string, chapter: string): Promise<void> {
    const openPath = projectPath(this.projectRoot, "openLoops");
    const resolvedPath = projectPath(this.projectRoot, "resolvedLoops");
    const openContent = (await readTextIfExists(openPath)) ?? "# 未回收伏笔\n";
    const lines = openContent.split(/\r?\n/u);
    const remaining: string[] = [];
    let resolvedDescription: string | null = null;

    for (const line of lines) {
      if (line.includes(`[${id}]`)) {
        resolvedDescription = line.replace(/^- \[[^\]]+\]\s*/u, "").trim();
        continue;
      }
      remaining.push(line);
    }

    await writeTextAtomic(openPath, `${remaining.join("\n").trimEnd()}\n`);

    const resolvedContent = (await readTextIfExists(resolvedPath)) ?? "# 已回收伏笔\n";
    const resolvedLine = `- [${id}] ${resolvedDescription ?? id} => ${resolution} (${chapter})`;
    await writeTextAtomic(resolvedPath, `${resolvedContent.trimEnd()}\n${resolvedLine}\n`);
  }

  public async logContradiction(entry: ContradictionEntry): Promise<void> {
    const parsed = contradictionEntrySchema.parse(entry);
    const filePath = projectPath(this.projectRoot, "contradictionLog");
    const current = (await readTextIfExists(filePath)) ?? "# 冲突日志\n";
    const block = [
      `## ${parsed.title}`,
      `- 严重级别: ${parsed.severity}`,
      `- 位置: ${parsed.location}`,
      `- 时间: ${parsed.createdAt.toISOString()}`,
      "",
      parsed.description,
      "",
    ].join("\n");
    await writeTextAtomic(filePath, `${current.trimEnd()}\n\n${block}`);
  }

  public async getStyle(): Promise<StyleBundle> {
    return styleBundleSchema.parse({
      proseStyle: (await readTextIfExists(projectPath(this.projectRoot, "proseStyle"))) ?? "",
      povRules: (await readTextIfExists(projectPath(this.projectRoot, "povRules"))) ?? "",
      tabooList: (await readTextIfExists(projectPath(this.projectRoot, "tabooList"))) ?? "",
    });
  }

  public async setStyle(style: StyleBundle): Promise<StyleBundle> {
    const parsed = styleBundleSchema.parse(style);
    await writeTextAtomic(projectPath(this.projectRoot, "proseStyle"), parsed.proseStyle);
    await writeTextAtomic(projectPath(this.projectRoot, "povRules"), parsed.povRules);
    await writeTextAtomic(projectPath(this.projectRoot, "tabooList"), parsed.tabooList);
    return parsed;
  }

  private resolveCanonBaseDirectory(category: CanonCategory): string {
    switch (category) {
      case "character":
        return projectPath(this.projectRoot, "characters");
      case "faction":
        return projectPath(this.projectRoot, "factions");
      case "location":
        return projectPath(this.projectRoot, "locations");
      case "world":
      case "resource":
      case "creature":
        return projectPath(this.projectRoot, "world");
    }
  }

  private resolveCanonFilePath(category: CanonCategory, name: string): string {
    const baseDir = this.resolveCanonBaseDirectory(category);
    const fileName = ensureMarkdownFileName(name);
    return path.join(baseDir, fileName);
  }

  private resolveOutlinePath(type: OutlineType, id: string): string {
    switch (type) {
      case "master":
        return projectPath(this.projectRoot, "masterOutline");
      case "volume":
        return path.join(projectPath(this.projectRoot, "volumePlans"), ensureMarkdownFileName(id));
      case "chapter":
        return path.join(projectPath(this.projectRoot, "chapterBriefs"), ensureMarkdownFileName(id));
    }
  }

  private async walkMarkdownFiles(directory: string): Promise<CanonEntry[]> {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const result: CanonEntry[] = [];

      for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          result.push(...(await this.walkMarkdownFiles(absolutePath)));
          continue;
        }

        if (!entry.isFile() || !entry.name.endsWith(".md")) {
          continue;
        }

        const content = (await readTextIfExists(absolutePath)) ?? "";
        const stat = await fs.stat(absolutePath);
        result.push(
          canonEntrySchema.parse({
            name: extractDisplayName(content, path.basename(entry.name, ".md")),
            category: inferCanonCategoryFromPath(absolutePath),
            tier: inferTierFromPath(absolutePath),
            filePath: absolutePath,
            content,
            lastModified: stat.mtime,
            metadata: {},
          }),
        );
      }

      return result;
    } catch {
      return [];
    }
  }
}

function ensureMarkdownFileName(name: string): string {
  const base = name.endsWith(".md") ? name.slice(0, -3) : name;
  return `${sanitizeProjectDirName(base)}.md`;
}

function extractDisplayName(content: string, fallback: string): string {
  const heading = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/u, "").trim() : fallback;
}

function parseForeshadowings(content: string, status: "open" | "resolved"): Foreshadowing[] {
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line, index) => {
      const match = /^- \[([^\]]+)\]\s+(.+?)(?:\s+\(([^)]+)\))?$/u.exec(line);
      return foreshadowingSchema.parse({
        id: match?.[1] ?? `loop-${index + 1}`,
        description: match?.[2] ?? line.slice(2).trim(),
        plantedIn: match?.[3] ?? "unknown",
        status,
      });
    });
}

function inferCanonCategoryFromPath(filePath: string): CanonCategory {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.includes("/characters/")) {
    return "character";
  }
  if (normalized.includes("/factions/")) {
    return "faction";
  }
  if (normalized.includes("/locations/")) {
    return "location";
  }
  if (normalized.endsWith("resources.md")) {
    return "resource";
  }
  if (normalized.endsWith("creatures.md")) {
    return "creature";
  }
  return "world";
}

function inferTierFromPath(filePath: string): 1 | 2 | 3 {
  const normalized = filePath.replaceAll("\\", "/");
  if (normalized.includes("minor_") || normalized.endsWith("resources.md") || normalized.endsWith("creatures.md")) {
    return 2;
  }
  return 3;
}

function allCanonDirectories(root: string): string[] {
  return [
    projectPath(root, "characters"),
    projectPath(root, "factions"),
    projectPath(root, "world"),
  ];
}
