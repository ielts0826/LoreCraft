import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AgentSessionProcessor } from "../../src/agents/session-processor.js";
import { ProjectManager } from "../../src/core/project.js";
import { projectPath } from "../../src/shared/constants.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
});

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lorecraft-agent-loop-"));
  tempRoots.push(root);
  const manager = new ProjectManager();
  const project = await manager.create("Agent Loop Demo", { baseDir: root });
  await fs.writeFile(projectPath(project.root, "premise"), "# 故事前提\n一座城被失踪的钟声困住。\n", "utf8");
  return project.root;
}

describe("agent session processor", () => {
  it("answers identity questions without exposing routing internals", async () => {
    const processor = new AgentSessionProcessor();
    const result = await processor.process(process.cwd(), "你是谁");

    expect(result.answer).toContain("LoreCraft");
    expect(result.answer).not.toContain("意图");
  });

  it("uses project tools for natural language file requests", async () => {
    const projectRoot = await makeProject();
    const processor = new AgentSessionProcessor();

    const result = await processor.process(projectRoot, "看看当前大纲");

    expect(result.usedTools.length).toBeGreaterThan(0);
    expect(result.answer).not.toContain("识别意图");
  });
});
