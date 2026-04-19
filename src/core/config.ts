import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

import { projectPath } from "../shared/constants.js";
import { ConfigError } from "../shared/errors.js";
import type { ProjectConfig } from "../shared/types.js";
import { ensureDir, exists, readTextIfExists, writeTextAtomic } from "../shared/utils.js";

const modelConfigSchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  apiKeyEnv: z.string().min(1).optional(),
  credentialId: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
});

const embeddingModelConfigSchema = modelConfigSchema.extend({
  provider: z.literal("siliconflow"),
  dimension: z.number().int().positive(),
});

const projectConfigSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  genre: z.string().min(1),
  creativeMode: z.enum(["assisted", "manual", "auto"]),
  models: z.object({
    writer: modelConfigSchema,
    reviewer: modelConfigSchema,
    extractor: modelConfigSchema,
    light: modelConfigSchema,
    embedding: embeddingModelConfigSchema,
  }),
  style: z.object({
    referenceFile: z.string().min(1).optional(),
  }),
  sandbox: z.object({
    mode: z.enum(["restricted", "workspace-write"]),
    allowNetwork: z.boolean(),
  }),
});

export function createDefaultConfig(projectName: string, genre = "general"): ProjectConfig {
  return {
    schemaVersion: 1,
    name: projectName,
    genre,
    creativeMode: "assisted",
    models: {
      writer: {
        provider: "openrouter",
        modelId: "anthropic/claude-sonnet-4-5",
        credentialId: "default-openrouter",
        apiKeyEnv: "OPENROUTER_API_KEY",
      },
      reviewer: {
        provider: "openrouter",
        modelId: "google/gemini-2.5-flash",
        credentialId: "default-openrouter",
        apiKeyEnv: "OPENROUTER_API_KEY",
      },
      extractor: {
        provider: "openrouter",
        modelId: "google/gemini-2.5-flash",
        credentialId: "default-openrouter",
        apiKeyEnv: "OPENROUTER_API_KEY",
      },
      light: {
        provider: "openrouter",
        modelId: "google/gemini-2.5-flash",
        credentialId: "default-openrouter",
        apiKeyEnv: "OPENROUTER_API_KEY",
      },
      embedding: {
        provider: "siliconflow",
        modelId: "BAAI/bge-m3",
        dimension: 1024,
        credentialId: "default-siliconflow",
        apiKeyEnv: "SILICONFLOW_API_KEY",
      },
    },
    style: {},
    sandbox: {
      mode: "restricted",
      allowNetwork: false,
    },
  };
}

export async function readProjectConfig(root: string): Promise<ProjectConfig> {
  const filePath = projectPath(root, "config");
  const raw = await readTextIfExists(filePath);
  if (raw === null) {
    throw new ConfigError(`缺少项目配置文件: ${filePath}`);
  }

  try {
    const parsed: unknown = YAML.parse(raw);
    return projectConfigSchema.parse(parsed);
  } catch (error) {
    throw new ConfigError(`配置文件格式无效: ${filePath}`, error);
  }
}

export async function writeProjectConfig(root: string, config: ProjectConfig): Promise<void> {
  const filePath = projectPath(root, "config");
  await ensureDir(path.dirname(filePath));
  const validated = projectConfigSchema.parse(config);
  await writeTextAtomic(filePath, YAML.stringify(validated));
}

export async function projectConfigExists(root: string): Promise<boolean> {
  return exists(projectPath(root, "config"));
}
