import { describe, expect, it } from "vitest";

import { LLMClient } from "../../src/llm/client.js";
import { LLMProviderError, type EmbeddingResponse, type GenerateResponse, type LLMProvider, type ProviderEmbeddingRequest, type ProviderGenerateRequest } from "../../src/llm/types.js";

class MockProvider implements LLMProvider {
  public readonly name: string;

  public generateCalls = 0;
  public embedCalls = 0;

  public constructor(
    name: string,
    private readonly implementation: {
      generate?: ((request: ProviderGenerateRequest, call: number) => Promise<GenerateResponse>) | undefined;
      embed?: ((request: ProviderEmbeddingRequest, call: number) => Promise<EmbeddingResponse>) | undefined;
    },
  ) {
    this.name = name;
  }

  public generate(request: ProviderGenerateRequest): Promise<GenerateResponse> {
    this.generateCalls += 1;
    if (!this.implementation.generate) {
      return Promise.reject(new LLMProviderError("generate unavailable", this.name, false));
    }

    return this.implementation.generate(request, this.generateCalls);
  }

  public embed(request: ProviderEmbeddingRequest): Promise<EmbeddingResponse> {
    this.embedCalls += 1;
    if (!this.implementation.embed) {
      return Promise.reject(new LLMProviderError("embed unavailable", this.name, false));
    }

    return this.implementation.embed(request, this.embedCalls);
  }
}

describe("llm client", () => {
  it("retries retryable generate failures", async () => {
    const provider = new MockProvider("mock", {
      generate: (_request, call) => {
        if (call < 2) {
          return Promise.reject(new LLMProviderError("temporary failure", "mock", true, 429));
        }

        return Promise.resolve({
          provider: "mock",
          model: "test-model",
          content: "ok",
        });
      },
    });

    const client = new LLMClient({
      providers: { mock: provider },
      retryPolicy: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 5 },
    });

    const response = await client.generate({
      provider: "mock",
      model: "test-model",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(response.content).toBe("ok");
    expect(provider.generateCalls).toBe(2);
  });

  it("supports structured generation validation", async () => {
    const provider = new MockProvider("mock", {
      generate: () => Promise.resolve({
        provider: "mock",
        model: "structured-model",
        content: "{\"ok\":true,\"count\":2}",
      }),
    });

    const client = new LLMClient({ providers: { mock: provider } });
    const result = await client.structuredGenerate({
      provider: "mock",
      model: "structured-model",
      messages: [{ role: "user", content: "json" }],
      schemaName: "TestSchema",
      validate: (value) => {
        const candidate = value as { ok?: boolean; count?: number };
        if (candidate.ok !== true || typeof candidate.count !== "number") {
          throw new Error("invalid");
        }
        return { ok: candidate.ok, count: candidate.count };
      },
    });

    expect(result).toEqual({ ok: true, count: 2 });
  });

  it("returns fallback embedding result when embed fails", async () => {
    const provider = new MockProvider("embedder", {
      embed: () => Promise.reject(new LLMProviderError("embedding unavailable", "embedder", false, 400)),
    });

    const client = new LLMClient({ providers: { embedder: provider } });
    const response = await client.embedWithFallback(
      {
        provider: "embedder",
        model: "embed-model",
        input: "hello",
      },
      () => Promise.resolve({
        provider: "fallback",
        model: "fallback-model",
        embeddings: [[0.1, 0.2]],
      }),
    );

    expect(response?.provider).toBe("fallback");
    expect(provider.embedCalls).toBe(1);
  });

  it("throws when provider is missing", async () => {
    const client = new LLMClient({ providers: {} });

    await expect(
      client.generate({
        provider: "missing",
        model: "x",
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow("Unknown provider");
  });
});
