import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MentionTracker } from "../../src/memory/mention-tracker.js";

const tempRoots: string[] = [];

async function makeTempDbPath(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lorecraft-mentions-"));
  tempRoots.push(root);
  return path.join(root, "mention_index.sqlite");
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
});

describe("mention tracker", () => {
  it("records repeated mentions and proposes upgrades", async () => {
    const dbPath = await makeTempDbPath();
    const tracker = new MentionTracker(dbPath);

    tracker.recordMention("灵石", "resource", "ch001");
    tracker.recordMention("灵石", "resource", "ch007");
    tracker.recordMention("灵石", "resource", "ch012");

    const record = tracker.getMention("灵石", "resource");
    const candidates = tracker.listUpgradeCandidates();

    expect(record?.occurrences).toBe(3);
    expect(record?.lastChapter).toBe("ch012");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.suggestedTier).toBe(2);
    tracker.close();
  });

  it("confirms upgrades into canon", async () => {
    const dbPath = await makeTempDbPath();
    const tracker = new MentionTracker(dbPath);

    tracker.recordMention("阿三", "character", "ch005");
    tracker.confirmUpgrade("阿三", "character", {
      tier: 2,
      canonFile: "story_bible/canon/characters/minor_characters.md",
      description: "北荒猎手",
    });

    const record = tracker.getMention("阿三", "character");
    expect(record?.tier).toBe(2);
    expect(record?.canonFile).toContain("minor_characters.md");
    expect(record?.description).toBe("北荒猎手");
    tracker.close();
  });
});
