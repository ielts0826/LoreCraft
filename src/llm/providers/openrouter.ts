import { LLMProviderError, type GenerateResponse, type LLMProvider, type OpenRouterProviderOptions, type ProviderGenerateRequest } from "../types.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterProvider implements LLMProvider {
  public readonly name = "openrouter";

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly options: OpenRouterProviderOptions) {
    this.baseUrl = options.baseUrl ?? OPENROUTER_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async generate(request: ProviderGenerateRequest): Promise<GenerateResponse> {
    const response = await this.fetchImpl(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": this.options.referer ?? "https://lorecraft.local",
        "X-Title": this.options.title ?? "LoreCraft",
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: request.stream ?? false,
      }),
      signal: request.signal ?? null,
    });

    if (!response.ok) {
      throw await toProviderError(response, this.name);
    }

    const payload = (await response.json()) as OpenRouterChatCompletionResponse;
    const choice = payload.choices?.[0];
    return {
      provider: this.name,
      model: payload.model ?? request.model,
      content: choice?.message?.content ?? "",
      finishReason: choice?.finish_reason,
      usage: payload.usage
        ? {
            promptTokens: payload.usage.prompt_tokens,
            completionTokens: payload.usage.completion_tokens,
            totalTokens: payload.usage.total_tokens,
          }
        : undefined,
      raw: payload,
    };
  }
}

interface OpenRouterChatCompletionResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
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
