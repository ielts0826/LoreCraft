import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CredentialStore } from "../../src/core/credential-store.js";

const tempRoots: string[] = [];

async function makeWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lorecraft-credentials-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true })));
});

describe("credential store", () => {
  it("persists and reads api keys by credential id", async () => {
    const workspace = await makeWorkspace();
    const store = new CredentialStore(path.join(workspace, "credentials.json"));

    await store.set("demo-writer", "sk-test");

    expect(await store.get("demo-writer")).toBe("sk-test");
    expect(await store.get("missing")).toBeNull();
    expect((await store.list()).map((item) => item.id)).toContain("demo-writer");
  });

  it("persists user-level model defaults", async () => {
    const workspace = await makeWorkspace();
    const store = new CredentialStore(path.join(workspace, "credentials.json"));

    await store.setModelDefault("writer", {
      provider: "openai-compatible",
      modelId: "glm-4.5-flash",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      credentialId: "default-zhipu",
    });

    expect(await store.getModelDefault("writer")).toMatchObject({
      provider: "openai-compatible",
      modelId: "glm-4.5-flash",
      credentialId: "default-zhipu",
    });
  });
});
