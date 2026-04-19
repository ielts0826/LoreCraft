export interface VectorRecord<TMeta = Record<string, unknown>> {
  id: string;
  embedding: number[];
  metadata: TMeta;
}

export interface VectorSearchResult<TMeta = Record<string, unknown>> {
  id: string;
  score: number;
  metadata: TMeta;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function serializeVector(embedding: number[]): Buffer {
  const typed = Float32Array.from(embedding);
  return Buffer.from(typed.buffer);
}

export function deserializeVector(buffer: Buffer): number[] {
  const view = new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / Float32Array.BYTES_PER_ELEMENT));
  return [...view];
}

export class InMemoryVectorIndex<TMeta = Record<string, unknown>> {
  private readonly records = new Map<string, VectorRecord<TMeta>>();

  public upsert(id: string, embedding: number[], metadata: TMeta): void {
    this.records.set(id, { id, embedding, metadata });
  }

  public remove(id: string): void {
    this.records.delete(id);
  }

  public search(queryEmbedding: number[], limit = 10): VectorSearchResult<TMeta>[] {
    return [...this.records.values()]
      .map((record) => ({
        id: record.id,
        score: cosineSimilarity(queryEmbedding, record.embedding),
        metadata: record.metadata,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}
