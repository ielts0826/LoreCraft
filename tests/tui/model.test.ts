import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ProjectManager } from "../../src/core/project.js";
import { projectPath } from "../../src/shared/constants.js";
import { readProjectSnapshot, buildTaskItems } from "../../src/tui/model.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (target) => fs.rm(target, { recursive: true, force: true })));
});

describe("tui project model", () => {
  it("reads project snapshot with outline and loop previews", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lorecraft-tui-"));
    tempRoots.push(root);

    const projectManager = new ProjectManager();
    const project = await projectManager.create("TUI Demo", { baseDir: root });

    await fs.writeFile(projectPath(project.root, "openLoops"), "# 未回收伏笔\n- [loop-1] 玉玺失踪 (ch001)\n", "utf8");
    await fs.writeFile(projectPath(project.root, "contradictionLog"), "## 时间线错位\n说明\n", "utf8");
    await fs.writeFile(path.join(projectPath(project.root, "chapterBriefs"), "ch001.md"), "# 第一章\n", "utf8");
    await fs.writeFile(path.join(projectPath(project.root, "volumePlans"), "vol01.md"), "# 第一卷\n", "utf8");

    const snapshot = await readProjectSnapshot(project.root, projectManager);

    expect(snapshot.isProject).toBe(true);
    expect(snapshot.openLoops).toContain("[loop-1] 玉玺失踪 (ch001)");
    expect(snapshot.contradictionPreview).toContain("时间线错位");
    expect(snapshot.outlineNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "chapter", id: "ch001.md" }),
        expect.objectContaining({ kind: "volume", id: "vol01.md" }),
      ]),
    );
  });

  it("builds task items from project status and messages", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "lorecraft-tui-"));
    tempRoots.push(root);

    const projectManager = new ProjectManager();
    const project = await projectManager.create("Task Demo", { baseDir: root });
    const snapshot = await readProjectSnapshot(project.root, projectManager);

    const tasks = buildTaskItems(snapshot, [
      {
        id: "m1",
        role: "user",
        title: "你",
        body: "/status",
        timestamp: new Date().toISOString(),
      },
    ]);

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.some((task) => task.title.length > 0)).toBe(true);
  });
});
