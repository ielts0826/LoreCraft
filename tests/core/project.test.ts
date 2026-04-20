import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CredentialStore } from "../../src/core/credential-store.js";
import { ProjectManager } from "../../src/core/project.js";
import { exists, readTextIfExists } from "../../src/shared/utils.js";

const tempRoots: string[] = [];

async function makeWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lorecraft-project-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
});

describe("project manager", () => {
  it("creates a new project with required files", async () => {
    const workspace = await makeWorkspace();
    const manager = new ProjectManager();

    const project = await manager.create("My Novel", { baseDir: workspace });

    expect(project.root).toBe(path.join(workspace, "my-novel"));
    expect(await exists(path.join(project.root, ".agent", "config.yaml"))).toBe(true);
    expect(await exists(path.join(project.root, "story_bible", "style", "prose_style.md"))).toBe(true);
    expect(await exists(path.join(project.root, "manuscript", "volumes"))).toBe(true);
  });

  it("loads status from an initialized project", async () => {
    const workspace = await makeWorkspace();
    const manager = new ProjectManager();
    const created = await manager.create("Status Novel", { baseDir: workspace });

    const chapterDir = path.join(created.root, "manuscript", "volumes", "vol_01");
    await fs.mkdir(chapterDir, { recursive: true });
    await fs.writeFile(path.join(chapterDir, "ch_001.md"), "# chapter\n", "utf8");
    await fs.writeFile(path.join(created.root, "story_bible", "continuity", "open_loops.md"), "# 未回收伏笔\n- 线索 A\n", "utf8");

    const loaded = await manager.load(created.root);
    const status = await manager.getStatus(loaded);

    expect(status.currentVolume).toBe(1);
    expect(status.currentChapter).toBe(1);
    expect(status.openForeshadowing).toBe(1);
    expect(await readTextIfExists(path.join(created.root, "story_bible", "style", "prose_style.md"))).toContain("文风规格");
  });

  it("applies user-level model defaults to new projects", async () => {
    const workspace = await makeWorkspace();
    const credentialStore = new CredentialStore(path.join(workspace, "credentials.json"));
    await credentialStore.setModelDefault("light", {
      provider: "openai-compatible",
      modelId: "glm-4.5-flash",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      credentialId: "default-zhipu",
    });

    const manager = new ProjectManager(undefined, undefined, credentialStore);
    const project = await manager.create("Defaults Novel", { baseDir: workspace });

    expect(project.config.models.light).toMatchObject({
      provider: "openai-compatible",
      modelId: "glm-4.5-flash",
      credentialId: "default-zhipu",
    });
  });
});
