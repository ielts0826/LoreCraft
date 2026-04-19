import type { LLMClient } from "../llm/client.js";
import { buildWriterSystemPrompt } from "../llm/prompts/system-writer.js";
import type { GenerateResponse } from "../llm/types.js";
import type { BuiltWriteContext } from "./context-builder.js";

export interface WriteChapterInput {
  provider: string;
  model: string;
  chapterId: string;
  chapterInstruction: string;
  context: BuiltWriteContext;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
}

export interface ChapterDraft {
  chapterId: string;
  content: string;
  raw: GenerateResponse;
}

export class WriterAgent {
  public constructor(private readonly llmClient: LLMClient) {}

  public async draftChapter(input: WriteChapterInput): Promise<ChapterDraft> {
    const systemPrompt = buildWriterSystemPrompt({
      styleSpec: input.context.styleSpec,
      chapterContext: input.context.chapterContext,
    });

    const response = await this.llmClient.generate({
      provider: input.provider,
      model: input.model,
      temperature: input.temperature ?? 0.8,
      maxTokens: input.maxTokens ?? 4_000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: input.chapterInstruction.trim() },
      ],
    });

    return {
      chapterId: input.chapterId,
      content: response.content.trim(),
      raw: response,
    };
  }
}
