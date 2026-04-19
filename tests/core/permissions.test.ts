import path from "node:path";

import { describe, expect, it } from "vitest";

import { PermissionError } from "../../src/shared/errors.js";
import { assertPathInProject, classifyOperationRisk } from "../../src/core/permissions.js";

describe("permissions", () => {
  it("allows paths inside the project", () => {
    const root = path.resolve("C:/repo/project");
    expect(() => assertPathInProject(path.join(root, "story_bible", "canon", "timeline.md"), root)).not.toThrow();
  });

  it("rejects paths outside the project", () => {
    const root = path.resolve("C:/repo/project");
    expect(() => assertPathInProject("C:/repo/other/file.md", root)).toThrow(PermissionError);
  });

  it("classifies canon writes as high risk", () => {
    expect(classifyOperationRisk("story_bible/canon/world/magic_system.md", "update")).toBe("high");
    expect(classifyOperationRisk("manuscript/volumes/vol_01/ch_001.md", "update")).toBe("medium");
    expect(classifyOperationRisk(".agent/cache/state.json", "create")).toBe("low");
  });
});
