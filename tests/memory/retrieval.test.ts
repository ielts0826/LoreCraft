import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { StoryIndexer } from "../../src/memory/indexer.js";
import { Retriever } from "../../src/memory/retrieval.js";
import { Tokenizer } from "../../src/memory/tokenizer.js";
import { PROJECT_DIRECTORIES, projectPath } from "../../src/shared/constants.js";

const tempRoots: string[] = [];

async function makeProjectRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lorecraft-retrieval-"));
  tempRoots.push(root);
  await Promise.all(PROJECT_DIRECTORIES.map(async (key) => fs.mkdir(projectPath(root, key), { recursive: true })));
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
});

describe("retrieval", () => {
  it("indexes project files and retrieves canon content first when rules prioritize canon", async () => {
    const root = await makeProjectRoot();
    const canonPath = path.join(root, "story_bible", "canon", "world", "geography.md");
    const chapterPath = path.join(root, "manuscript", "volumes", "vol_01", "ch_001.md");

    await fs.mkdir(path.dirname(canonPath), { recursive: true });
    await fs.mkdir(path.dirname(chapterPath), { recursive: true });
    await fs.writeFile(canonPath, "# 北荒\n\n天机阁位于北荒边境。", "utf8");
    await fs.writeFile(chapterPath, "# 第一章\n\n林墨在天机阁门口停下。", "utf8");

    const tokenizer = new Tokenizer();
    tokenizer.init();
    tokenizer.addEntityWord("天机阁");

    const indexer = new StoryIndexer(root, tokenizer);
    await indexer.reindexAll({ full: true });

    const retriever = new Retriever(indexer);
    const results = await retriever.search({
      text: "天机阁",
      maxResults: 5,
      rules: [{ type: "canon_over_draft", weight: 1 }],
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.layer).toBe("canon");
    expect(results.some((item) => item.layer === "manuscript")).toBe(true);

    indexer.close();
  });

  it("supports layer filtering", async () => {
    const root = await makeProjectRoot();
    const outlinePath = path.join(root, "story_bible", "outlines", "master_outline.md");
    await fs.writeFile(outlinePath, "# 总纲\n\n林墨进入北荒。", "utf8");

    const tokenizer = new Tokenizer();
    tokenizer.init();
    const indexer = new StoryIndexer(root, tokenizer);
    await indexer.reindexAll({ full: true });

    const retriever = new Retriever(indexer);
    const results = await retriever.search({
      text: "北荒",
      layers: ["outline"],
      maxResults: 3,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.layer).toBe("outline");

    indexer.close();
  });
});
