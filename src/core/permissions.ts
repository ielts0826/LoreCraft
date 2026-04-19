import path from "node:path";

import { PermissionError } from "../shared/errors.js";
import type { RiskLevel } from "../shared/types.js";

export function assertPathInProject(filePath: string, projectRoot: string): void {
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(projectRoot);

  if (resolvedPath === resolvedRoot) {
    return;
  }

  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new PermissionError(`路径越界，拒绝访问：${filePath}`);
  }
}

export function classifyOperationRisk(target: string, operation: "create" | "update" | "delete"): RiskLevel {
  const normalized = target.replaceAll("\\", "/");

  if (
    normalized.includes("story_bible/canon/") ||
    normalized.endsWith(".agent/config.yaml") ||
    operation === "delete"
  ) {
    return operation === "create" ? "medium" : "high";
  }

  if (normalized.includes("story_bible/") || normalized.includes("manuscript/")) {
    return "medium";
  }

  return "low";
}
