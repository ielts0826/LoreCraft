import { describe, expect, it } from "vitest";

import {
  createModelWizard,
  getModelWizardOptions,
  resolveProviderChoice,
  resolveProviderInput,
  resolveRoleInput,
} from "../../src/tui/model-wizard.js";

describe("model wizard", () => {
  it("lists role options for the first step", () => {
    const options = getModelWizardOptions(createModelWizard(), "");

    expect(options.map((item) => item.id)).toEqual(["writer", "reviewer", "extractor", "light"]);
  });

  it("filters provider options by input", () => {
    const options = getModelWizardOptions({ step: "provider", role: "writer" }, "zhi");

    expect(options.map((item) => item.id)).toEqual(["zhipu"]);
  });

  it("resolves fixed provider mappings", () => {
    expect(resolveRoleInput("writer")).toBe("writer");
    expect(resolveProviderInput("moonshot")).toBe("moonshot");
    expect(resolveProviderChoice("moonshot")).toEqual({
      provider: "openai-compatible",
      baseUrl: "https://api.moonshot.cn/v1",
    });
    expect(resolveProviderChoice("zhipu")).toEqual({
      provider: "openai-compatible",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    });
  });
});
