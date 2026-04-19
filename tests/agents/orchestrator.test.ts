import { describe, expect, it } from "vitest";

import { OrchestratorAgent } from "../../src/agents/orchestrator.js";

describe("orchestrator agent", () => {
  it("routes write commands to context builder and writer", () => {
    const orchestrator = new OrchestratorAgent();
    const plan = orchestrator.analyzeIntent("/write ch012");

    expect(plan.intent).toBe("write");
    expect(plan.modules).toEqual(["context-builder", "writer"]);
    expect(plan.riskLevel).toBe("medium");
  });

  it("marks expand as high risk and requiring confirmation", () => {
    const orchestrator = new OrchestratorAgent();
    const plan = orchestrator.analyzeIntent("/expand outlines/vol_03.md");

    expect(plan.intent).toBe("expand");
    expect(plan.needsConfirmation).toBe(true);
    expect(plan.riskLevel).toBe("high");
  });
});
