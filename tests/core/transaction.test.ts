import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PATHS } from "../../src/shared/constants.js";
import { exists, readTextIfExists } from "../../src/shared/utils.js";
import { TransactionManager } from "../../src/core/transaction.js";

const tempRoots: string[] = [];

async function makeProjectRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lorecraft-txn-"));
  tempRoots.push(root);
  await fs.mkdir(path.join(root, PATHS.transactions), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
});

describe("transaction manager", () => {
  it("commits staged files", async () => {
    const root = await makeProjectRoot();
    const manager = new TransactionManager();
    const txn = await manager.begin(root, "create file");

    await txn.stage(path.join(root, "story_bible", "outlines", "premise.md"), "# premise\n", "seed");
    await txn.commit();

    const content = await readTextIfExists(path.join(root, "story_bible", "outlines", "premise.md"));
    expect(content).toBe("# premise\n");
  });

  it("rolls back stale staging transactions", async () => {
    const root = await makeProjectRoot();
    const manager = new TransactionManager();
    const txn = await manager.begin(root, "stale");

    await txn.stage(path.join(root, "manuscript", "volumes", "vol_01", "ch_001.md"), "draft", "write draft");
    await manager.recoverStale(root);

    const fileExists = await exists(path.join(root, "manuscript", "volumes", "vol_01", "ch_001.md"));
    expect(fileExists).toBe(false);
  });

  it("reopens a staged transaction and inspects its diff", async () => {
    const root = await makeProjectRoot();
    const manager = new TransactionManager();
    const target = path.join(root, "story_bible", "style", "prose_style.md");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, "# old\n", "utf8");

    const txn = await manager.begin(root, "update style");
    await txn.stage(target, "# new\n", "style update");

    const reopened = await manager.open(root, txn.id);
    const diff = await reopened.getDiff();

    expect(reopened.description).toBe("update style");
    expect(diff).toEqual([
      {
        target: path.relative(root, target),
        type: "update",
        oldContent: "# old\n",
        newContent: "# new\n",
      },
    ]);
  });
});
