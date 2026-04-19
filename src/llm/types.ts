export type LLMRole = "system" | "user" | "assistant" | "tool";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface GenerateRequest {
  provider: string;
  model: string;
  messages: LLMMessage[];
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  stream?: boolean | undefined;
  signal?: AbortSignal | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface GenerateResponse {
  provider: string;
  model: string;
  content: string;
  finishReason?: string | undefined;
  usage?: {
    promptTokens?: number | undefined;
    completionTokens?: number | undefined;
    totalTokens?: number | undefined;
  } | undefined;
  raw?: unknown;
}

export interface EmbeddingRequest {
  provider: string;
  model: string;
  input: string | string[];
  signal?: AbortSignal | undefined;
}

export interface EmbeddingResponse {
  provider: string;
  model: string;
  embeddings: number[][];
  raw?: unknown;
}

export interface StructuredGenerateRequest<TSchema> extends GenerateRequest {
  schemaName: string;
  validate: (value: unknown) => TSchema;
}

export type ProviderGenerateRequest = GenerateRequest;

export type ProviderEmbeddingRequest = EmbeddingRequest;

export interface LLMProvider {
  readonly name: string;
  generate(request: ProviderGenerateRequest): Promise<GenerateResponse>;
  embed?(request: ProviderEmbeddingRequest): Promise<EmbeddingResponse>;
}

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export class LLMProviderError extends Error {
  public constructor(
    message: string,
    public readonly provider: string,
    public readonly retryable = false,
    public readonly statusCode?: number,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "LLMProviderError";
  }
}

export interface OpenRouterProviderOptions {
  apiKey: string;
  baseUrl?: string | undefined;
  referer?: string | undefined;
  title?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string | undefined;
  apiVersion?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface SiliconFlowEmbeddingProviderOptions {
  apiKey: string;
  baseUrl?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}
