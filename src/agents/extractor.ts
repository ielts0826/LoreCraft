import { z } from "zod";

import { buildExtractorSystemPrompt } from "../llm/prompts/system-extractor.js";
import type { LLMClient } from "../llm/client.js";
import type { FileMemoryStore } from "../memory/store.js";
import type { MentionTracker } from "../memory/mention-tracker.js";
import type { CanonEntry } from "../memory/schema.js";

const extractorReportSchema = z.object({
  silent_tracking: z.array(z.record(z.string(), z.unknown())),
  upgrade_proposals: z.array(z.record(z.string(), z.unknown())),
  entity_updates: z.array(z.record(z.string(), z.unknown())),
  new_foreshadowing: z.array(z.record(z.string(), z.unknown())),
  resolved_foreshadowing: z.array(z.record(z.string(), z.unknown())),
  timeline_update: z.record(z.string(), z.unknown()),
});

export type ExtractorReport = z.infer<typeof extractorReportSchema>;

export interface ExtractChapterInput {
  provider: string;
  model: string;
  chapterId: string;
  chapterText: string;
  candidateEntities?: string[] | undefined;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
}

export class KnowledgeExtractorAgent {
  public constructor(
    private readonly llmClient: LLMClient,
    private readonly store: FileMemoryStore,
    private readonly mentionTracker: MentionTracker,
  ) {}

  public async extractChapterKnowledge(input: ExtractChapterInput): Promise<ExtractorReport> {
    const canonEntries = await this.store.listCanon();
    const mentionEntries = this.mentionTracker.listMentions().slice(0, 50);
    const timeline = (await readTimeline(this.store)) ?? "未提供时间线。";

    const systemPrompt = buildExtractorSystemPrompt({
      chapterText: input.chapterText,
      canonIndex: summarizeCanonEntries(canonEntries),
      mentionIndexSummary: summarizeMentionEntries(mentionEntries),
      candidateEntities: input.candidateEntities,
      timeline,
    });

    return this.llmClient.structuredGenerate({
      provider: input.provider,
      model: input.model,
      temperature: input.temperature ?? 0.1,
      maxTokens: input.maxTokens ?? 2_500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `请提取章节 ${input.chapterId} 的知识变更。` },
      ],
      schemaName: "ExtractorReport",
      validate: (value) => extractorReportSchema.parse(value),
    });
  }
}

async function readTimeline(store: FileMemoryStore): Promise<string | null> {
  const timelineEntry = await store.getCanon("world", "timeline");
  if (timelineEntry) {
    return timelineEntry.content;
  }

  return null;
}

function summarizeCanonEntries(entries: CanonEntry[]): string {
  if (entries.length === 0) {
    return "当前没有 canon 条目。";
  }

  return entries
    .slice(0, 100)
    .map((entry) => `- [${entry.category}] ${entry.name} (tier ${entry.tier})`)
    .join("\n");
}

function summarizeMentionEntries(
  entries: ReturnType<MentionTracker["listMentions"]>,
): string {
  if (entries.length === 0) {
    return "mention index 为空。";
  }

  return entries
    .map((entry) => `- ${entry.entityName} / ${entry.entityType} / tier ${entry.tier} / ${entry.occurrences}次`)
    .join("\n");
}
