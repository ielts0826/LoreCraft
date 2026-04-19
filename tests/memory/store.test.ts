import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileMemoryStore } from "../../src/memory/store.js";
import { PROJECT_DIRECTORIES, projectPath } from "../../src/shared/constants.js";

const tempRoots: string[] = [];

async function makeProjectRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lorecraft-store-"));
  tempRoots.push(root);
  await Promise.all(PROJECT_DIRECTORIES.map(async (key) => fs.mkdir(projectPath(root, key), { recursive: true })));
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
});

describe("file memory store", () => {
  it("writes and reads canon entries", async () => {
    const root = await makeProjectRoot();
    const store = new FileMemoryStore(root);

    await store.setCanon("character", "Lin Mo", {
      tier: 3,
      content: "# Lin Mo\n\n主角人物卡",
    });

    const entry = await store.getCanon("character", "Lin Mo");
    const listed = await store.listCanon("character");

    expect(entry?.content).toContain("主角人物卡");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe("Lin Mo");
  });

  it("manages style files and open loops", async () => {
    const root = await makeProjectRoot();
    const store = new FileMemoryStore(root);

    await store.setStyle({
      proseStyle: "# 文风规格\n\n克制、冷硬。",
      povRules: "# POV\n\n单章不切换。",
      tabooList: "# 禁忌\n\n不要解释性对白。",
    });

    await store.addOpenLoop({
      id: "loop-1",
      description: "林墨在拍卖会看到密信",
      plantedIn: "ch012",
      status: "open",
    });

    const style = await store.getStyle();
    const openLoops = await store.getOpenLoops();

    expect(style.proseStyle).toContain("文风规格");
    expect(openLoops).toHaveLength(1);
    expect(openLoops[0]?.description).toContain("密信");
  });
});
