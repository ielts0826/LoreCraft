import fs from "node:fs/promises";
import path from "node:path";

import { ProjectManager } from "../core/project.js";
import { projectPath } from "../shared/constants.js";
import { ProjectError } from "../shared/errors.js";
import { exists, readTextIfExists } from "../shared/utils.js";
import { ToolRegistry } from "./registry.js";

const MAX_FILE_BYTES = 80_000;

export function createBuiltinToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register({
    name: "project_status",
    description: "Read current LoreCraft project status.",
    async execute(_args, context) {
      const manager = new ProjectManager();
      const project = await manager.load(context.projectRoot);
      const status = await manager.getStatus(project);
      return {
        name: project.config.name,
        genre: project.config.genre,
        currentVolume: status.currentVolume,
        currentChapter: status.currentChapter,
        chapterBriefs: status.totalChaptersPlanned,
        openForeshadowing: status.openForeshadowing,
        pendingConfirmations: status.pendingConfirmations,
      };
    },
  });

  registry.register({
    name: "list_files",
    description: "List project files.",
    async execute(args, context) {
      const relativePath = readStringArg(args.path) ?? ".";
      const target = resolveInsideProject(context.projectRoot, relativePath);
      const entries = await fs.readdir(target, { withFileTypes: true });
      return entries
        .filter((entry) => !entry.name.startsWith(".git"))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
          path: path.relative(context.projectRoot, path.join(target, entry.name)).replaceAll("\\", "/"),
        }))
        .slice(0, 80);
    },
  });

  registry.register({
    name: "read_file",
    description: "Read a UTF-8 text file from the project.",
    async execute(args, context) {
      const relativePath = readStringArg(args.path);
      if (!relativePath) {
        throw new ProjectError("read_file requires path.");
      }

      const target = resolveInsideProject(context.projectRoot, relativePath);
      const stat = await fs.stat(target);
      if (stat.size > MAX_FILE_BYTES) {
        throw new ProjectError(`File is too large to read directly: ${relativePath}`);
      }

      return {
        path: relativePath,
        content: await fs.readFile(target, "utf8"),
      };
    },
  });

  registry.register({
    name: "search_files",
    description: "Find text files whose path or content matches a query.",
    async execute(args, context) {
      const query = readStringArg(args.query)?.toLowerCase();
      if (!query) {
        throw new ProjectError("search_files requires query.");
      }

      const files = await walkTextFiles(context.projectRoot);
      const matched = [];
      for (const file of files) {
        const relative = path.relative(context.projectRoot, file).replaceAll("\\", "/");
        const content = await readTextIfExists(file);
        if (relative.toLowerCase().includes(query) || content?.toLowerCase().includes(query)) {
          matched.push({
            path: relative,
            excerpt: makeExcerpt(content ?? "", query),
          });
        }
      }

      return matched.slice(0, 20);
    },
  });

  registry.register({
    name: "read_outline",
    description: "Read key outline files.",
    async execute(_args, context) {
      const files = [
        projectPath(context.projectRoot, "premise"),
        projectPath(context.projectRoot, "masterOutline"),
        projectPath(context.projectRoot, "timeline"),
      ];
      const entries = [];
      for (const file of files) {
        if (await exists(file)) {
          entries.push({
            path: path.relative(context.projectRoot, file).replaceAll("\\", "/"),
            content: await fs.readFile(file, "utf8"),
          });
        }
      }

      return entries;
    },
  });

  return registry;
}

function resolveInsideProject(projectRoot: string, relativePath: string): string {
  const resolved = path.resolve(projectRoot, relativePath);
  const root = path.resolve(projectRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new ProjectError(`Path escapes project root: ${relativePath}`);
  }

  return resolved;
}

async function walkTextFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkTextFiles(absolute)));
      continue;
    }

    if (entry.isFile() && /\.(md|txt|yaml|yml|json)$/iu.test(entry.name)) {
      files.push(absolute);
    }
  }

  return files;
}

function makeExcerpt(content: string, query: string): string {
  const normalized = content.replace(/\s+/gu, " ");
  const index = normalized.toLowerCase().indexOf(query);
  if (index < 0) {
    return normalized.slice(0, 180);
  }

  return normalized.slice(Math.max(0, index - 80), index + query.length + 120);
}

function readStringArg(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
