import { describe, expect, it } from "vitest";

import { buildExpandPlannerPrompt } from "../../src/llm/prompts/expand-planner.js";
import { buildExtractorSystemPrompt } from "../../src/llm/prompts/system-extractor.js";
import { buildOrchestratorSystemPrompt } from "../../src/llm/prompts/system-orchestrator.js";
import { buildReviewerSystemPrompt } from "../../src/llm/prompts/system-reviewer.js";
import { buildWriterSystemPrompt } from "../../src/llm/prompts/system-writer.js";
import { buildStyleAnalyzerPrompt } from "../../src/llm/prompts/style-analyzer.js";

describe("prompt builders", () => {
  it("builds writer prompt in Chinese with required sections", () => {
    const prompt = buildWriterSystemPrompt({
      styleSpec: "## 文风\n- 克制",
      chapterContext: "林墨第一次进入北荒。",
    });

    expect(prompt).toContain("你是一个长篇中文小说写作引擎");
    expect(prompt).toContain("## 文风规格");
    expect(prompt).toContain("## 当前章节上下文");
    expect(prompt).toContain("[WARNING]");
  });

  it("builds reviewer prompt with strict json requirements", () => {
    const prompt = buildReviewerSystemPrompt({
      chapterText: "正文",
      relatedCanon: "人物卡",
      timeline: "时间线",
      openLoops: "open",
      resolvedLoops: "resolved",
    });

    expect(prompt).toContain("只输出 JSON");
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

    expect(prompt).toContain("你是一个小说知识提取引擎");
    expect(prompt).toContain("天机阁、林墨");
    expect(prompt).toContain("\"silent_tracking\"");
  });

  it("builds orchestrator prompt in Chinese", () => {
    const prompt = buildOrchestratorSystemPrompt({
      userIntent: "/write ch012",
      projectStatus: "第三卷",
      recentContext: "上一轮确认了拍卖会设定。",
    });

    expect(prompt).toContain("你是 LoreCraft 的主编排器");
    expect(prompt).toContain("建议调用模块");
    expect(prompt).toContain("/write ch012");
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

  it("builds expand planner prompt in Chinese", () => {
    const prompt = buildExpandPlannerPrompt({
      outlineText: "主角进入北荒。",
      existingCanon: "已有北境设定。",
      openLoops: "父亲身份",
      genreTemplate: "修仙模板",
    });

    expect(prompt).toContain("分卷扩展规划器");
    expect(prompt).toContain("[!] 新建 / [~] 修改");
    expect(prompt).toContain("主角进入北荒");
  });
});
