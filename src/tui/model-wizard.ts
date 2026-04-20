import type { TextModelRole } from "../shared/types.js";
import type { PaletteItem } from "./palette.js";

export type ModelProviderChoice = "anthropic" | "openrouter" | "moonshot" | "zhipu" | "custom";

export interface ModelWizardState {
  step: "role" | "provider" | "modelId" | "baseUrl" | "apiKey";
  role?: TextModelRole | undefined;
  providerChoice?: ModelProviderChoice | undefined;
  modelId?: string | undefined;
  baseUrl?: string | undefined;
}

export interface ModelWizardConnectionTarget {
  provider: "anthropic" | "openrouter" | "openai-compatible";
  baseUrl?: string | undefined;
}

const ROLE_OPTIONS: ReadonlyArray<{ value: TextModelRole; description: string }> = [
  { value: "writer", description: "主写作模型，负责章节正文生成。" },
  { value: "reviewer", description: "审查模型，负责一致性和连续性检查。" },
  { value: "extractor", description: "抽取模型，负责从章节提取设定变化。" },
  { value: "light", description: "轻量模型，负责规划、分析和低成本任务。" },
];

const PROVIDER_OPTIONS: ReadonlyArray<{ value: ModelProviderChoice; description: string }> = [
  { value: "anthropic", description: "官方 Anthropic 接口，URL 固定。" },
  { value: "openrouter", description: "OpenRouter 聚合接口，URL 固定。" },
  { value: "moonshot", description: "Moonshot / Kimi，URL 固定。" },
  { value: "zhipu", description: "智谱 GLM，URL 固定。" },
  { value: "custom", description: "完全自定义，手动输入 Base URL、模型名和 API Key。" },
];

export function createModelWizard(): ModelWizardState {
  return { step: "role" };
}

export function getModelWizardPrompt(state: ModelWizardState): { title: string; body: string; placeholder: string } {
  switch (state.step) {
    case "role":
      return {
        title: "模型向导",
        body: "第 1 步：请选择要绑定的角色。可用上下键选择，回车确认。",
        placeholder: "选择角色：writer / reviewer / extractor / light",
      };

    case "provider":
      return {
        title: "模型向导",
        body: `第 2 步：已选择角色 ${state.role}。请选择供应商。`,
        placeholder: "选择供应商：anthropic / openrouter / moonshot / zhipu / custom",
      };

    case "modelId":
      return {
        title: "模型向导",
        body: `第 3 步：已选择 ${state.providerChoice}。请输入模型名称。`,
        placeholder: "输入模型名，例如 claude-3-7-sonnet-20250219 或 glm-4.5-flash",
      };

    case "baseUrl":
      return {
        title: "模型向导",
        body: "第 4 步：请输入自定义 Base URL。",
        placeholder: "输入 Base URL，例如 https://api.example.com/v1",
      };

    case "apiKey":
      return {
        title: "模型向导",
        body: "最后一步：请输入 API Key，回车后会自动保存并测试连接。按 Esc 可退出。",
        placeholder: "输入 API Key",
      };
  }
}

export function getModelWizardOptions(state: ModelWizardState, input: string): PaletteItem[] {
  const query = input.trim().toLowerCase();

  if (state.step === "role") {
    return ROLE_OPTIONS.filter((item) => matches(query, item.value)).map((item) => ({
      id: item.value,
      label: item.value,
      description: item.description,
      template: item.value,
    }));
  }

  if (state.step === "provider") {
    return PROVIDER_OPTIONS.filter((item) => matches(query, item.value)).map((item) => ({
      id: item.value,
      label: item.value,
      description: item.description,
      template: item.value,
    }));
  }

  return [];
}

export function resolveRoleInput(input: string): TextModelRole | null {
  const normalized = input.trim().toLowerCase();
  return ROLE_OPTIONS.find((item) => item.value === normalized)?.value ?? null;
}

export function resolveProviderInput(input: string): ModelProviderChoice | null {
  const normalized = input.trim().toLowerCase();
  return PROVIDER_OPTIONS.find((item) => item.value === normalized)?.value ?? null;
}

export function resolveProviderChoice(choice: ModelProviderChoice, customBaseUrl?: string): ModelWizardConnectionTarget {
  switch (choice) {
    case "anthropic":
      return { provider: "anthropic" };

    case "openrouter":
      return { provider: "openrouter" };

    case "moonshot":
      return {
        provider: "openai-compatible",
        baseUrl: "https://api.moonshot.cn/v1",
      };

    case "zhipu":
      return {
        provider: "openai-compatible",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      };

    case "custom":
      return {
        provider: "openai-compatible",
        baseUrl: customBaseUrl,
      };
  }
}

function matches(query: string, value: string): boolean {
  return query.length === 0 || value.includes(query);
}
