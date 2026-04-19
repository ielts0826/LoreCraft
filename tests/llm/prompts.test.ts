import { describe, expect, it } from "vitest";

import { buildExpandPlannerPrompt } from "../../src/llm/prompts/expand-planner.js";
import { buildStyleAnalyzerPrompt } from "../../src/llm/prompts/style-analyzer.js";
import { buildExtractorSystemPrompt } from "../../src/llm/prompts/system-extractor.js";
import { buildOrchestratorSystemPrompt } from "../../src/llm/prompts/system-orchestrator.js";
import { buildReviewerSystemPrompt } from "../../src/llm/prompts/system-reviewer.js";
import { buildWriterSystemPrompt } from "../../src/llm/prompts/system-writer.js";

describe("prompt builders", () => {
  it("builds writer prompt with required sections", () => {
    const prompt = buildWriterSystemPrompt({
      styleSpec: "## 文风\n- 克制",
      chapterContext: "林墨第一次进入北荒。",
    });

    expect(prompt).toContain("## 文风规格");
    expect(prompt).toContain("## 当前章节上下文");
    expect(prompt).toContain("[WARNING]");
    expect(prompt).toContain("林墨第一次进入北荒。");
  });

  it("builds reviewer prompt with structured JSON requirements", () => {
    const prompt = buildReviewerSystemPrompt({
      chapterText: "正文",
      relatedCanon: "人物卡",
      timeline: "时间线",
      openLoops: "open",
      resolvedLoops: "resolved",
    });

    expect(prompt).toContain("JSON");
    expect(prompt).toContain("\"issues\"");
    expect(prompt).toContain("\"character_consistency\"");
  });

  it("builds extractor prompt with candidate entities", () => {
    const prompt = buildExtractorSystemPrompt({
      chapterText: "正文",
      canonIndex: "canon",
      mentionIndexSummary: "mention",
      candidateEntities: ["天机阁", "林墨"],
      timeline: "timeline",
    });

    expect(prompt).toContain("天机阁");
    expect(prompt).toContain("林墨");
    expect(prompt).toContain("\"silent_tracking\"");
  });

  it("builds orchestrator prompt with user intent", () => {
    const prompt = buildOrchestratorSystemPrompt({
      userIntent: "/write ch012",
      projectStatus: "第三卷",
      recentContext: "上一轮确认了拍卖会设定。",
    });

    expect(prompt).toContain("/write ch012");
    expect(prompt).toContain("第三卷");
    expect(prompt).toContain("最近上下文");
  });

  it("builds style analyzer prompt in Chinese", () => {
    const prompt = buildStyleAnalyzerPrompt({
      referenceText: "参考文本",
      existingStyle: "# 文风规格",
    });

    expect(prompt).toContain("中文小说文风分析器");
    expect(prompt).toContain("## 分析维度");
    expect(prompt).toContain("# 文风规格");
  });

  it("builds expand planner prompt with diff markers", () => {
    const prompt = buildExpandPlannerPrompt({
      outlineText: "主角进入北荒。",
      existingCanon: "已有北境设定。",
      openLoops: "父亲身份",
      genreTemplate: "修仙模板",
    });

    expect(prompt).toContain("[!] 新建 / [~] 修改");
    expect(prompt).toContain("主角进入北荒。");
    expect(prompt).toContain("已有北境设定。");
  });
});
