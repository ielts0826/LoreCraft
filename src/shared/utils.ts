import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(filePath: string): Promise<string | null> {
  if (!(await exists(filePath))) {
    return null;
  }

  return fs.readFile(filePath, "utf8");
}

export async function writeTextAtomic(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFileAtomic(filePath, content, { encoding: "utf8" });
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  const raw = await readTextIfExists(filePath);
  if (raw === null) {
    return null;
  }

  return JSON.parse(raw) as T;
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function estimateTokens(text: string): number {
  if (!text.trim()) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}

export function sanitizeProjectDirName(name: string): string {
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/giu, "-")
    .replace(/^-+|-+$/gu, "");

  return sanitized || "lorecraft-project";
}

export function parseNumericSuffix(name: string, prefix: string): number {
  const match = new RegExp(`^${prefix}(\\d+)$`, "u").exec(name);
  if (!match) {
    return 0;
  }

  return Number.parseInt(match[1]!, 10);
}
