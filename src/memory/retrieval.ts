import { retrievalQuerySchema, retrievalResultSchema, type RetrievalQuery, type RetrievalQueryInput, type RetrievalResult } from "./schema.js";
import type { StoryIndexer } from "./indexer.js";
import type { InMemoryVectorIndex } from "./vector.js";

export class Retriever {
  public constructor(
    private readonly indexer: StoryIndexer,
    private readonly vectorIndex?: InMemoryVectorIndex<{ source: string; layer: string; category: string; content: string }>,
  ) {}

  public search(query: RetrievalQueryInput): Promise<RetrievalResult[]> {
    const parsed = retrievalQuerySchema.parse(query);
    const combined = new Map<string, RetrievalResult>();

    if (parsed.useBM25) {
      const indexedResults = this.indexer.search({
        query: parsed.text,
        layers: parsed.layers,
        categories: parsed.categories,
        maxResults: parsed.maxResults,
      });

      for (const row of indexedResults) {
        combined.set(
          row.filePath,
          retrievalResultSchema.parse({
            source: row.filePath,
            layer: row.layer,
            category: row.category,
            content: row.rawContent,
            score: row.bm25Score * parsed.weights.bm25,
            matchType: row.matchType,
            metadata: {
              title: row.title,
            },
          }),
        );
      }
    }

    if (parsed.useVector && parsed.queryEmbedding && this.vectorIndex) {
      const vectorResults = this.vectorIndex.search(parsed.queryEmbedding, parsed.maxResults);
      for (const result of vectorResults) {
        const current = combined.get(result.metadata.source);
        const nextScore = (current?.score ?? 0) + result.score * parsed.weights.vector;
        combined.set(
          result.metadata.source,
          retrievalResultSchema.parse({
            source: result.metadata.source,
            layer: result.metadata.layer,
            category: result.metadata.category,
            content: result.metadata.content,
            score: nextScore,
            matchType: current ? "hybrid" : "vector",
            metadata: current?.metadata ?? {},
          }),
        );
      }
    }

    let results = [...combined.values()].map((result) => ({
      ...result,
      score: applyRules(result, parsed),
    }));

    if (parsed.useStructure) {
      results = results.map((result) => ({
        ...result,
        score: result.score + calculateStructureBonus(result, parsed),
      }));
    }

    return Promise.resolve(
      results
      .filter((result) => result.score >= parsed.minScore)
      .sort((left, right) => right.score - left.score)
      .slice(0, parsed.maxResults)
      .map((result) => retrievalResultSchema.parse(result)),
    );
  }

  public async searchParallel(queries: RetrievalQueryInput[]): Promise<RetrievalResult[][]> {
    return Promise.all(queries.map(async (query) => this.search(query)));
  }
}

function calculateStructureBonus(result: RetrievalResult, query: RetrievalQuery): number {
  let bonus = 0;
  if (query.layers?.includes(result.layer as "canon" | "outline" | "continuity" | "manuscript")) {
    bonus += query.weights.structure / 2;
  }
  if (query.categories?.includes(result.category)) {
    bonus += query.weights.structure / 2;
  }
  return bonus;
}

function applyRules(result: RetrievalResult, query: RetrievalQuery): number {
  let score = result.score;

  for (const rule of query.rules) {
    switch (rule.type) {
      case "canon_over_draft":
        if (result.layer === "canon") {
          score += rule.weight;
        }
        break;
      case "latest_confirmed":
        if (result.layer !== "manuscript") {
          score += rule.weight;
        }
        break;
      case "deprioritize_deprecated":
        if (result.content.toLowerCase().includes("deprecated")) {
          score -= Math.abs(rule.weight);
        }
        break;
      case "prioritize_current_volume":
        if (rule.value && result.source.replaceAll("\\", "/").includes(`/${rule.value}/`)) {
          score += rule.weight;
        }
        break;
    }
  }

  return score;
}
