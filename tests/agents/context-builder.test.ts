import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ContextBuilder } from "../../src/agents/context-builder.js";
import { StoryIndexer } from "../../src/memory/indexer.js";
import { Retriever } from "../../src/memory/retrieval.js";
import { FileMemoryStore } from "../../src/memory/store.js";
import { Tokenizer } from "../../src/memory/tokenizer.js";
import { PROJECT_DIRECTORIES, projectPath } from "../../src/shared/constants.js";

const tempRoots: string[] = [];

async function makeProjectRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lorecraft-agents-ctx-"));
  tempRoots.push(root);
  await Promise.all(PROJECT_DIRECTORIES.map(async (key) => fs.mkdir(projectPath(root, key), { recursive: true })));
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
});

describe("context builder", () => {
  it("builds write context from style, loops, and retrieval results", async () => {
    const root = await makeProjectRoot();
    const store = new FileMemoryStore(root);
    await store.setStyle({
      proseStyle: "# 文风规格\n\n冷硬、克制。",
      povRules: "# POV\n\n单章不切换。",
      tabooList: "# 禁忌\n\n不要解释性对白。",
    });
    await store.addOpenLoop({
      id: "loop-1",
      description: "林墨在拍卖会看到密信",
      plantedIn: "ch012",
      status: "open",
    });
    await store.setCanon("character", "Lin Mo", {
      tier: 3,
      content: "# Lin Mo\n\n主角人物卡，林墨从不直接叫父亲“爸”。",
    });

    const tokenizer = new Tokenizer();
    tokenizer.init();
    const indexer = new StoryIndexer(root, tokenizer);
    await indexer.reindexAll({ full: true });
    const retriever = new Retriever(indexer);
    const builder = new ContextBuilder(store, retriever);

    const context = await builder.buildWriteContext({
      chapterId: "ch012",
      chapterBrief: "林墨在拍卖会发现密信，并与父亲身份线索发生关联。",
      previousChapterSummary: "上一章林墨进入地下拍卖会。",
      currentVolumeGoal: "拍卖会线索引出父亲身份真相。",
    });

    expect(context.styleSpec).toContain("文风规格");
    expect(context.chapterContext).toContain("上一章林墨进入地下拍卖会");
    expect(context.chapterContext).toContain("林墨在拍卖会看到密信");
    expect(context.retrieved.length).toBeGreaterThan(0);

    indexer.close();
  });
});
