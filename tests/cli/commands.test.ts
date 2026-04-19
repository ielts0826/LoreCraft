import { describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/index.js";

describe("cli command registration", () => {
  it("registers the phase 6 commands", () => {
    const cli = createCli();
    const commandNames = cli.commands.map((command) => command.name());

    expect(commandNames).toContain("lookup");
    expect(commandNames).toContain("check");
    expect(commandNames).toContain("write");
    expect(commandNames).toContain("plan");
    expect(commandNames).toContain("expand");
    expect(commandNames).toContain("tui");
  });
});
