import { describe, expect, it } from "vitest";

import { filterTuiCommands, shouldAutocompleteCommandInput, tokenizeCommandLine } from "../../src/tui/commands.js";

describe("tui command palette", () => {
  it("tokenizes quoted command arguments", () => {
    expect(tokenizeCommandLine('/write ch001 --brief "夜色中的追逐"')).toEqual([
      "/write",
      "ch001",
      "--brief",
      "夜色中的追逐",
    ]);
  });

  it("filters command suggestions from slash input", () => {
    const commands = filterTuiCommands("/wr");
    expect(commands.some((command) => command.name === "/write")).toBe(true);
  });

  it("autocompletes when command requires arguments", () => {
    const writeCommand = filterTuiCommands("/write")[0];
    const statusCommand = filterTuiCommands("/status")[0];

    expect(shouldAutocompleteCommandInput("/write", writeCommand)).toBe(true);
    expect(shouldAutocompleteCommandInput("/status", statusCommand)).toBe(false);
  });
});
