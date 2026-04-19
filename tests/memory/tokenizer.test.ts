import { describe, expect, it } from "vitest";

import { Tokenizer } from "../../src/memory/tokenizer.js";

describe("tokenizer", () => {
  it("tokenizes and preserves custom entity words", () => {
    const tokenizer = new Tokenizer();
    tokenizer.init();
    tokenizer.addEntityWord("天机阁");

    const tokenized = tokenizer.tokenizeQuery("林墨在天机阁遇到了苏晴");

    expect(tokenized).toContain("天机阁");
  });

  it("extracts keywords", () => {
    const tokenizer = new Tokenizer();
    tokenizer.init();

    const keywords = tokenizer.extractKeywords("林墨在天机阁遇到了苏晴，天机阁背后有秘密。", 5);

    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.some((item) => item.keyword.trim().length >= 2)).toBe(true);
  });
});
