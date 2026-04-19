import { z } from "zod";

import type { LLMClient } from "../llm/client.js";
import { buildReviewerSystemPrompt } from "../llm/prompts/system-reviewer.js";
import type { BuiltReviewContext } from "./context-builder.js";

const reviewIssueSchema = z.object({
  type: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
  description: z.string().min(1),
  location: z.string().min(1),
  suggestion: z.string().min(1),
  canon_reference: z.string().nullable().optional(),
});

const reviewReportSchema = z.object({
  chapter: z.string().min(1),
  issues: z.array(reviewIssueSchema),
  score: z.object({
    character_consistency: z.number().min(0).max(10),
    timeline_consistency: z.number().min(0).max(10),
    world_rule_compliance: z.number().min(0).max(10),
    plot_coherence: z.number().min(0).max(10),
  }),
});

export type ReviewReport = z.infer<typeof reviewReportSchema>;

export interface ReviewChapterInput {
  provider: string;
  model: string;
  chapterId: string;
  context: BuiltReviewContext;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
}

export class ReviewerAgent {
  public constructor(private readonly llmClient: LLMClient) {}

  public async reviewChapter(input: ReviewChapterInput): Promise<ReviewReport> {
    const systemPrompt = buildReviewerSystemPrompt({
      chapterText: input.context.chapterText,
      relatedCanon: input.context.relatedCanon,
      timeline: input.context.timeline,
      openLoops: input.context.openLoops,
      resolvedLoops: input.context.resolvedLoops,
    });

    return this.llmClient.structuredGenerate({
      provider: input.provider,
      model: input.model,
      temperature: input.temperature ?? 0.2,
      maxTokens: input.maxTokens ?? 2_000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `请审查章节 ${input.chapterId}。` },
      ],
      schemaName: "ReviewReport",
      validate: (value) => reviewReportSchema.parse(value),
    });
  }
}
