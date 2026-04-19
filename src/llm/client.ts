import { LLMProviderError, type EmbeddingRequest, type EmbeddingResponse, type GenerateRequest, type GenerateResponse, type LLMProvider, type RetryPolicy, type StructuredGenerateRequest } from "./types.js";

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  initialDelayMs: 250,
  maxDelayMs: 2_000,
  backoffMultiplier: 2,
};

export interface LLMClientOptions {
  providers: Record<string, LLMProvider>;
  retryPolicy?: Partial<RetryPolicy> | undefined;
}

export class LLMClient {
  private readonly providers: Map<string, LLMProvider>;
  private readonly retryPolicy: RetryPolicy;

  public constructor(options: LLMClientOptions) {
    this.providers = new Map(Object.entries(options.providers));
    this.retryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      ...options.retryPolicy,
    };
  }

  public async generate(request: GenerateRequest): Promise<GenerateResponse> {
    return this.withRetry(async () => this.getProvider(request.provider).generate(request), request.provider);
  }

  public async structuredGenerate<TSchema>(request: StructuredGenerateRequest<TSchema>): Promise<TSchema> {
    const response = await this.generate(request);
    let parsed: unknown;

    try {
      parsed = JSON.parse(response.content);
    } catch (error) {
      throw new LLMProviderError("Structured generation did not return valid JSON.", request.provider, false, undefined, error);
    }

    return request.validate(parsed);
  }

  public async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const provider = this.getProvider(request.provider);
    if (!provider.embed) {
      throw new LLMProviderError(`Provider "${request.provider}" does not support embeddings.`, request.provider, false);
    }

    return this.withRetry(async () => provider.embed!(request), request.provider);
  }

  public async embedWithFallback(
    request: EmbeddingRequest,
    fallback?: () => Promise<EmbeddingResponse | null>,
  ): Promise<EmbeddingResponse | null> {
    try {
      return await this.embed(request);
    } catch {
      if (!fallback) {
        return null;
      }

      return fallback();
    }
  }

  public registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  private getProvider(name: string): LLMProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new LLMProviderError(`Unknown provider: ${name}`, name, false);
    }

    return provider;
  }

  private async withRetry<T>(operation: () => Promise<T>, providerName: string): Promise<T> {
    let attempt = 0;
    let delayMs = this.retryPolicy.initialDelayMs;
    let lastError: unknown;

    while (attempt <= this.retryPolicy.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const retryable = isRetryable(error);
        if (!retryable || attempt >= this.retryPolicy.maxRetries) {
          break;
        }

        await delay(delayMs);
        delayMs = Math.min(
          Math.round(delayMs * this.retryPolicy.backoffMultiplier),
          this.retryPolicy.maxDelayMs,
        );
      }

      attempt += 1;
    }

    if (lastError instanceof LLMProviderError) {
      throw lastError;
    }

    throw new LLMProviderError("LLM operation failed.", providerName, false, undefined, lastError);
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof LLMProviderError) {
    return error.retryable;
  }

  if (error instanceof Error) {
    return true;
  }

  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
