import { projectPath } from "../shared/constants.js";
import { readTextIfExists } from "../shared/utils.js";
import type { Retriever } from "../memory/retrieval.js";
import type { FileMemoryStore } from "../memory/store.js";
import type { RetrievalResult } from "../memory/schema.js";

export interface WriteContextRequest {
  chapterId: string;
  chapterBrief: string;
  userIntent?: string | undefined;
  previousChapterSummary?: string | undefined;
  currentVolumeGoal?: string | undefined;
  maxRetrieved?: number | undefined;
}

export interface ReviewContextRequest {
  chapterId: string;
  chapterText: string;
  maxRetrieved?: number | undefined;
}

export interface BuiltWriteContext {
  styleSpec: string;
  chapterContext: string;
  retrieved: RetrievalResult[];
  sections: {
    previousChapterSummary: string;
    currentVolumeGoal: string;
    openLoops: string;
    retrievedContext: string;
  };
}

export interface BuiltReviewContext {
  chapterText: string;
  relatedCanon: string;
  timeline: string;
  openLoops: string;
  resolvedLoops: string;
  retrieved: RetrievalResult[];
}

export class ContextBuilder {
  public constructor(
    private readonly store: FileMemoryStore,
    private readonly retriever: Retriever,
  ) {}

  public async buildWriteContext(request: WriteContextRequest): Promise<BuiltWriteContext> {
    const style = await this.store.getStyle();
    const openLoops = await this.store.getOpenLoops();
    const maxRetrieved = request.maxRetrieved ?? 8;
    const retrievalResults = await this.retriever.search({
      text: [request.chapterBrief, request.userIntent].filter(Boolean).join("\n"),
      maxResults: maxRetrieved,
      rules: [{ type: "canon_over_draft", weight: 1 }],
    });

    const styleSpec = formatStyleBundle(style);
    const sections = {
      previousChapterSummary: request.previousChapterSummary?.trim() || "无上一章摘要。",
      currentVolumeGoal: request.currentVolumeGoal?.trim() || "未提供当前卷目标。",
      openLoops:
        openLoops.length > 0
          ? openLoops.map((loop) => `- [${loop.id}] ${loop.description} (${loop.plantedIn})`).join("\n")
          : "当前没有未回收伏笔。",
      retrievedContext: formatRetrievalResults(retrievalResults),
    };

    const chapterContext = [
      `章节标识：${request.chapterId}`,
      "## 本章简报",
      request.chapterBrief.trim(),
      "",
      "## 上一章摘要",
      sections.previousChapterSummary,
      "",
      "## 当前卷目标",
      sections.currentVolumeGoal,
      "",
      "## 未回收伏笔",
      sections.openLoops,
      "",
      "## 检索补充上下文",
      sections.retrievedContext,
    ].join("\n");

    return {
      styleSpec,
      chapterContext,
      retrieved: retrievalResults,
      sections,
    };
  }

  public async buildReviewContext(request: ReviewContextRequest): Promise<BuiltReviewContext> {
    const maxRetrieved = request.maxRetrieved ?? 10;
    const retrieved = await this.retriever.search({
      text: request.chapterText,
      maxResults: maxRetrieved,
      layers: ["canon", "continuity"],
      rules: [{ type: "canon_over_draft", weight: 1 }],
    });

    const timeline = (await readTextIfExists(projectPath(this.store.projectRoot, "timeline"))) ?? "未提供时间线。";
    const openLoops = (await readTextIfExists(projectPath(this.store.projectRoot, "openLoops"))) ?? "未提供未回收伏笔。";
    const resolvedLoops =
      (await readTextIfExists(projectPath(this.store.projectRoot, "resolvedLoops"))) ?? "未提供已回收伏笔。";

    return {
      chapterText: request.chapterText,
      relatedCanon: formatRetrievalResults(retrieved),
      timeline,
      openLoops,
      resolvedLoops,
      retrieved,
    };
  }
}

function formatStyleBundle(style: Awaited<ReturnType<FileMemoryStore["getStyle"]>>): string {
  return [
    style.proseStyle.trim(),
    style.povRules.trim(),
    style.tabooList.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatRetrievalResults(results: RetrievalResult[]): string {
  if (results.length === 0) {
    return "未检索到额外上下文。";
  }

  return results
    .map((result, index) => {
      const title = typeof result.metadata.title === "string" ? result.metadata.title : result.source;
      return [
        `### ${index + 1}. ${title}`,
        `- 层级: ${result.layer}`,
        `- 类别: ${result.category}`,
        `- 分数: ${result.score.toFixed(3)}`,
        result.content.trim(),
      ].join("\n");
    })
    .join("\n\n");
}
