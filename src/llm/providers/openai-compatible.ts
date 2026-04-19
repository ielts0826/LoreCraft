import {
  LLMProviderError,
  type GenerateResponse,
  type LLMProvider,
  type OpenAICompatibleProviderOptions,
  type ProviderGenerateRequest,
} from "../types.js";

export class OpenAICompatibleProvider implements LLMProvider {
  public readonly name: string;

  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(name: string, private readonly options: OpenAICompatibleProviderOptions) {
    this.name = name;
    this.endpoint = normalizeChatCompletionsUrl(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async generate(request: ProviderGenerateRequest): Promise<GenerateResponse> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
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

    const payload = (await response.json()) as OpenAICompatibleResponse;
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

interface OpenAICompatibleResponse {
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

function normalizeChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/u, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  return `${trimmed}/chat/completions`;
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
