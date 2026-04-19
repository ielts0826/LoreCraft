import { LLMProviderError, type AnthropicProviderOptions, type GenerateResponse, type LLMProvider, type ProviderGenerateRequest } from "../types.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export class AnthropicProvider implements LLMProvider {
  public readonly name = "anthropic";

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(private readonly options: AnthropicProviderOptions) {
    this.baseUrl = options.baseUrl ?? ANTHROPIC_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async generate(request: ProviderGenerateRequest): Promise<GenerateResponse> {
    const systemText = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");

    const response = await this.fetchImpl(this.baseUrl, {
      method: "POST",
      headers: {
        "x-api-key": this.options.apiKey,
        "anthropic-version": this.options.apiVersion ?? "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 2_000,
        temperature: request.temperature,
        system: systemText || undefined,
        messages: request.messages
          .filter((message) => message.role !== "system")
          .map((message) => ({
            role: message.role,
            content: message.content,
          })),
      }),
      signal: request.signal ?? null,
    });

    if (!response.ok) {
      throw await toProviderError(response, this.name);
    }

    const payload = (await response.json()) as AnthropicResponse;
    const text = payload.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n") ?? "";

    return {
      provider: this.name,
      model: payload.model ?? request.model,
      content: text,
      finishReason: payload.stop_reason,
      usage: payload.usage
        ? {
            promptTokens: payload.usage.input_tokens,
            completionTokens: payload.usage.output_tokens,
            totalTokens: (payload.usage.input_tokens ?? 0) + (payload.usage.output_tokens ?? 0),
          }
        : undefined,
      raw: payload,
    };
  }
}

interface AnthropicResponse {
  model?: string;
  stop_reason?: string;
  content?: Array<{
    type: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
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
