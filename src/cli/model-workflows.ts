import path from "node:path";

import { CredentialStore } from "../core/credential-store.js";
import { writeProjectConfig } from "../core/config.js";
import { ProjectManager } from "../core/project.js";
import { ProjectError } from "../shared/errors.js";
import { sanitizeProjectDirName } from "../shared/utils.js";
import type { ProjectConfig, TextModelRole } from "../shared/types.js";
import { createLLMClientFromConfig, getProviderAlias } from "./runtime.js";

const TEXT_MODEL_ROLES: readonly TextModelRole[] = ["writer", "reviewer", "extractor", "light"];
const SUPPORTED_TEXT_PROVIDERS = ["openrouter", "anthropic", "openai-compatible"] as const;

export interface SetModelBindingOptions {
  provider: string;
  modelId: string;
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
  credentialId?: string | undefined;
  test?: boolean | undefined;
}

export async function getModelConfigurationSummary(
  directory: string,
  projectManager = new ProjectManager(),
  credentialStore = new CredentialStore(),
): Promise<string> {
  const project = await projectManager.load(path.resolve(directory));
  const credentialIds = new Set((await credentialStore.list()).map((item) => item.id));

  return [
    `项目：${project.config.name}`,
    "配置范围：当前项目目录中的 `.agent/config.yaml` 保存角色绑定；API Key 单独保存在当前用户目录，不写入项目文件。",
    "",
    ...TEXT_MODEL_ROLES.map((role) => formatRoleSummary(role, project.config, credentialIds)),
    "",
    "支持的 provider：openrouter / anthropic / openai-compatible",
    "Kimi、GLM 等兼容 OpenAI 接口的厂商，建议使用 `openai-compatible`。",
    "",
    "示例：",
    "/model set writer openai-compatible moonshot-v1-8k --base-url https://api.moonshot.cn/v1 --api-key <你的Key> --test",
    "/model set reviewer openai-compatible glm-4.5-flash --base-url https://open.bigmodel.cn/api/paas/v4 --api-key <你的Key> --test",
    "/model test writer",
  ].join("\n");
}

export async function setModelBinding(
  directory: string,
  role: TextModelRole,
  options: SetModelBindingOptions,
  projectManager = new ProjectManager(),
  credentialStore = new CredentialStore(),
): Promise<string> {
  const projectRoot = path.resolve(directory);
  const project = await projectManager.load(projectRoot);
  const nextConfig = structuredClone(project.config);
  const modelConfig = nextConfig.models[role];
  const credentialId = options.credentialId ?? (options.apiKey?.trim() ? buildGlobalCredentialId(options.provider, options.baseUrl) : modelConfig.credentialId);

  modelConfig.provider = options.provider;
  modelConfig.modelId = options.modelId;
  modelConfig.baseUrl = options.baseUrl?.trim() ? options.baseUrl.trim() : undefined;
  modelConfig.credentialId = credentialId;

  if (!SUPPORTED_TEXT_PROVIDERS.includes(options.provider as (typeof SUPPORTED_TEXT_PROVIDERS)[number])) {
    throw new ProjectError(`不支持的文本模型 provider: ${options.provider}`);
  }

  if (options.provider === "openai-compatible" && !modelConfig.baseUrl) {
    throw new ProjectError("openai-compatible provider 必须提供 --base-url。");
  }

  if (options.apiKey?.trim()) {
    if (!credentialId) {
      throw new ProjectError("无法为该模型生成 credentialId。");
    }

    await credentialStore.set(credentialId, options.apiKey.trim());
    modelConfig.apiKeyEnv = undefined;
  }

  await writeProjectConfig(projectRoot, nextConfig);
  await credentialStore.setModelDefault(role, modelConfig);

  let testSummary: string | null = null;
  if (options.test) {
    testSummary = await testModelConnection(projectRoot, role, projectManager, credentialStore);
  }

  return [
    `已更新 ${role} 角色模型绑定。`,
    `provider: ${modelConfig.provider}`,
    `modelId: ${modelConfig.modelId}`,
    `baseUrl: ${modelConfig.baseUrl ?? "<默认>"}`,
    `credentialId: ${modelConfig.credentialId ?? "<未设置>"}`,
    testSummary ? "" : null,
    testSummary,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function testModelConnection(
  directory: string,
  role: TextModelRole,
  projectManager = new ProjectManager(),
  credentialStore = new CredentialStore(),
): Promise<string> {
  const project = await projectManager.load(path.resolve(directory));
  const modelConfig = project.config.models[role];
  if (!modelConfig.credentialId && !modelConfig.apiKeyEnv) {
    throw new ProjectError(`${role} 尚未配置 API Key。`);
  }

  const client = await createLLMClientFromConfig(project.config, credentialStore);
  const response = await client.generate({
    provider: getProviderAlias(role),
    model: modelConfig.modelId,
    temperature: 0,
    maxTokens: 32,
    messages: [
      {
        role: "system",
        content: "你是 LoreCraft 的连接测试助手。请只回复一行简短文本。",
      },
      {
        role: "user",
        content: "请回复：LoreCraft connection ok",
      },
    ],
  });

  return [
    `连接测试成功：${role}`,
    `provider: ${modelConfig.provider}`,
    `modelId: ${modelConfig.modelId}`,
    `返回：${response.content.trim() || "<空响应>"}`,
  ].join("\n");
}

function formatRoleSummary(
  role: TextModelRole,
  config: ProjectConfig,
  credentialIds: Set<string>,
): string {
  const model = config.models[role];
  const credentialStatus = model.credentialId
    ? credentialIds.has(model.credentialId)
      ? `credential=${model.credentialId}`
      : `credential=${model.credentialId} (未找到本地密钥)`
    : model.apiKeyEnv
      ? `env=${model.apiKeyEnv}`
      : "未配置密钥";

  return [
    `[${role}]`,
    `  provider: ${model.provider}`,
    `  modelId: ${model.modelId}`,
    `  baseUrl: ${model.baseUrl ?? "<默认>"}`,
    `  key: ${credentialStatus}`,
  ].join("\n");
}

function buildGlobalCredentialId(provider: string, baseUrl?: string): string {
  const normalizedBaseUrl = baseUrl?.toLowerCase() ?? "";
  if (provider === "openrouter") {
    return "default-openrouter";
  }
  if (provider === "anthropic") {
    return "default-anthropic";
  }
  if (normalizedBaseUrl.includes("moonshot")) {
    return "default-moonshot";
  }
  if (normalizedBaseUrl.includes("bigmodel")) {
    return "default-zhipu";
  }

  return `default-${sanitizeProjectDirName(provider)}`;
}
