import { LLMProviderError, type EmbeddingResponse, type LLMProvider, type ProviderEmbeddingRequest, type SiliconFlowEmbeddingProviderOptions } from "../types.js";

const SILICONFLOW_EMBEDDING_URL = "https://api.siliconflow.cn/v1/embeddings";

export class SiliconFlowEmbeddingProvider implements LLMProvider {
  public readonly name = "siliconflow";

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly options: SiliconFlowEmbeddingProviderOptions) {
    this.baseUrl = options.baseUrl ?? SILICONFLOW_EMBEDDING_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public generate(): Promise<never> {
    return Promise.reject(
      new LLMProviderError("SiliconFlow embedding provider does not support text generation.", this.name, false),
    );
  }

  public async embed(request: ProviderEmbeddingRequest): Promise<EmbeddingResponse> {
    const response = await this.fetchImpl(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        input: request.input,
      }),
      signal: request.signal ?? null,
    });

    if (!response.ok) {
      throw await toProviderError(response, this.name);
    }

    const payload = (await response.json()) as SiliconFlowEmbeddingResponse;
    return {
      provider: this.name,
      model: payload.model ?? request.model,
      embeddings: payload.data?.map((item) => item.embedding ?? []) ?? [],
      raw: payload,
    };
  }
}

interface SiliconFlowEmbeddingResponse {
  model?: string;
  data?: Array<{
    embedding?: number[];
  }>;
}

async function toProviderError(response: Response, provider: string): Promise<LLMProviderError> {
  const body = await safeReadBody(response);
  return new LLMProviderError(
    `Provider ${provider} returned ${response.status}: ${body}`,
    provider,
    response.status === 429 || response.status >= 500,
    response.status,
  );
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable response body>";
  }
}
