import { describe, expect, it } from "vitest";

import { KnowledgeExtractorAgent } from "../../src/agents/extractor.js";
import { ReviewerAgent } from "../../src/agents/reviewer.js";
import { WriterAgent } from "../../src/agents/writer.js";
import { LLMClient } from "../../src/llm/client.js";
import type { EmbeddingResponse, GenerateResponse, LLMProvider, ProviderEmbeddingRequest, ProviderGenerateRequest } from "../../src/llm/types.js";

class MockProvider implements LLMProvider {
  public readonly name = "mock";

  public constructor(
    private readonly handler: {
      generate: (request: ProviderGenerateRequest) => Promise<GenerateResponse>;
      embed?: ((request: ProviderEmbeddingRequest) => Promise<EmbeddingResponse>) | undefined;
    },
  ) {}

  public generate(request: ProviderGenerateRequest): Promise<GenerateResponse> {
    return this.handler.generate(request);
  }

  public embed(request: ProviderEmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.handler.embed) {
      return Promise.reject(new Error("embed not implemented"));
    }
    return this.handler.embed(request);
  }
}

describe("agent workflow boundaries", () => {
  it("writer agent delegates to llm client with built context", async () => {
    const client = new LLMClient({
      providers: {
        mock: new MockProvider({
          generate: (request) =>
            Promise.resolve({
              provider: "mock",
              model: request.model,
              content: `${request.messages.at(-1)?.content}\n\n正文完成。`,
            }),
        }),
      },
    });

    const writer = new WriterAgent(client);
    const draft = await writer.draftChapter({
      provider: "mock",
      model: "writer-model",
      chapterId: "ch012",
      chapterInstruction: "写第12章：林墨在拍卖会发现密信。",
      context: {
        styleSpec: "# 文风规格\n\n冷硬。",
        chapterContext: "## 本章简报\n林墨发现密信。",
        retrieved: [],
        sections: {
          previousChapterSummary: "上一章进入拍卖会。",
          currentVolumeGoal: "父亲身份线推进。",
          openLoops: "loop",
          retrievedContext: "none",
        },
      },
    });

    expect(draft.chapterId).toBe("ch012");
    expect(draft.content).toContain("正文完成");
  });

  it("reviewer and extractor agents validate structured json responses", async () => {
    const client = new LLMClient({
      providers: {
        mock: new MockProvider({
          generate: (request) => {
            const systemText = request.messages[0]?.content ?? "";
            if (systemText.includes("独立审稿引擎")) {
              return Promise.resolve({
                provider: "mock",
                model: request.model,
                content: JSON.stringify({
                  chapter: "ch012",
                  issues: [],
                  score: {
                    character_consistency: 9,
                    timeline_consistency: 8,
                    world_rule_compliance: 9,
                    plot_coherence: 8,
                  },
                }),
              });
            }

            return Promise.resolve({
              provider: "mock",
              model: request.model,
              content: JSON.stringify({
                silent_tracking: [],
                upgrade_proposals: [],
                entity_updates: [],
                new_foreshadowing: [],
                resolved_foreshadowing: [],
                timeline_update: {},
              }),
            });
          },
        }),
      },
    });

    const reviewer = new ReviewerAgent(client);
    const report = await reviewer.reviewChapter({
      provider: "mock",
      model: "reviewer-model",
      chapterId: "ch012",
      context: {
        chapterText: "正文",
        relatedCanon: "设定",
        timeline: "时间线",
        openLoops: "open",
        resolvedLoops: "resolved",
        retrieved: [],
      },
    });

    expect(report.chapter).toBe("ch012");
    expect(report.issues).toHaveLength(0);

    const fakeStore = {
      projectRoot: "unused",
      listCanon: () => Promise.resolve([]),
      getCanon: () => Promise.resolve(null),
    } as const;
    const fakeMentionTracker = {
      listMentions: () => [],
    } as const;

    const extractor = new KnowledgeExtractorAgent(
      client,
      fakeStore as never,
      fakeMentionTracker as never,
    );
    const extraction = await extractor.extractChapterKnowledge({
      provider: "mock",
      model: "extractor-model",
      chapterId: "ch012",
      chapterText: "正文",
    });

    expect(extraction.upgrade_proposals).toHaveLength(0);
    expect(extraction.timeline_update).toEqual({});
  });
});
