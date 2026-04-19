import fs from "node:fs/promises";
import path from "node:path";

import { ContextBuilder } from "../agents/context-builder.js";
import { KnowledgeExtractorAgent } from "../agents/extractor.js";
import { OrchestratorAgent } from "../agents/orchestrator.js";
import { ReviewerAgent } from "../agents/reviewer.js";
import { WriterAgent } from "../agents/writer.js";
import { ProjectManager } from "../core/project.js";
import { TransactionManager } from "../core/transaction.js";
import { LLMClient } from "../llm/client.js";
import { AnthropicProvider } from "../llm/providers/anthropic.js";
import { SiliconFlowEmbeddingProvider } from "../llm/providers/embedding.js";
import { OpenRouterProvider } from "../llm/providers/openrouter.js";
import { StoryIndexer } from "../memory/indexer.js";
import { MentionTracker } from "../memory/mention-tracker.js";
import { Retriever } from "../memory/retrieval.js";
import { FileMemoryStore } from "../memory/store.js";
import { Tokenizer } from "../memory/tokenizer.js";
import type { ProjectConfig } from "../shared/types.js";
import type { Project } from "../shared/types.js";
import { ProjectError } from "../shared/errors.js";
import { projectPath } from "../shared/constants.js";

export interface ProjectServices {
  project: Project;
  store: FileMemoryStore;
  tokenizer: Tokenizer;
  indexer: StoryIndexer;
  retriever: Retriever;
  mentionTracker: MentionTracker;
  llmClient: LLMClient;
  contextBuilder: ContextBuilder;
  writerAgent: WriterAgent;
  reviewerAgent: ReviewerAgent;
  extractorAgent: KnowledgeExtractorAgent;
  orchestratorAgent: OrchestratorAgent;
  transactionManager: TransactionManager;
  close(): void;
}

export interface CommandRuntime {
  projectManager: ProjectManager;
  transactionManager: TransactionManager;
  createProjectServices(projectDir: string): Promise<ProjectServices>;
}

export function createCommandRuntime(
  projectManager = new ProjectManager(),
  transactionManager = new TransactionManager(),
): CommandRuntime {
  return {
    projectManager,
    transactionManager,
    async createProjectServices(projectDir: string): Promise<ProjectServices> {
      const project = await projectManager.load(projectDir);
      const store = new FileMemoryStore(project.root);
      const tokenizer = new Tokenizer();
      tokenizer.init();

      const mentionTracker = new MentionTracker(projectPath(project.root, "mentionIndex"));
      tokenizer.buildDictionary(mentionTracker.listMentions().map((entry) => entry.entityName));

      const indexer = new StoryIndexer(project.root, tokenizer);
      await indexer.reindexAll({ full: false, embeddingModelId: project.config.models.embedding.modelId });
      const retriever = new Retriever(indexer);
      const llmClient = createLLMClientFromConfig(project.config);
      const contextBuilder = new ContextBuilder(store, retriever);
      const writerAgent = new WriterAgent(llmClient);
      const reviewerAgent = new ReviewerAgent(llmClient);
      const extractorAgent = new KnowledgeExtractorAgent(llmClient, store, mentionTracker);
      const orchestratorAgent = new OrchestratorAgent(llmClient);

      return {
        project,
        store,
        tokenizer,
        indexer,
        retriever,
        mentionTracker,
        llmClient,
        contextBuilder,
        writerAgent,
        reviewerAgent,
        extractorAgent,
        orchestratorAgent,
        transactionManager,
        close(): void {
          mentionTracker.close();
          indexer.close();
        },
      };
    },
  };
}

export function createLLMClientFromConfig(config: ProjectConfig): LLMClient {
  const providers = new Map<string, OpenRouterProvider | AnthropicProvider | SiliconFlowEmbeddingProvider>();

  const openRouterKey = resolveProviderApiKey(config, "openrouter");
  if (openRouterKey) {
    providers.set(
      "openrouter",
      new OpenRouterProvider({
        apiKey: openRouterKey,
      }),
    );
  }

  const anthropicKey = resolveProviderApiKey(config, "anthropic");
  if (anthropicKey) {
    providers.set(
      "anthropic",
      new AnthropicProvider({
        apiKey: anthropicKey,
      }),
    );
  }

  const siliconflowKey = resolveProviderApiKey(config, "siliconflow");
  if (siliconflowKey) {
    providers.set(
      "siliconflow",
      new SiliconFlowEmbeddingProvider({
        apiKey: siliconflowKey,
      }),
    );
  }

  return new LLMClient({
    providers: Object.fromEntries(providers),
  });
}

export function selectModel(
  config: ProjectConfig,
  key: "writer" | "reviewer" | "extractor" | "light",
  override?: { provider?: string | undefined; model?: string | undefined },
): { provider: string; model: string } {
  const base = config.models[key];
  return {
    provider: override?.provider ?? base.provider,
    model: override?.model ?? base.modelId,
  };
}

export async function resolveChapterFile(projectRoot: string, chapterInput?: string): Promise<string> {
  if (chapterInput && chapterInput.endsWith(".md")) {
    return path.resolve(projectRoot, chapterInput);
  }

  const chapterFiles = await walkMarkdownFiles(projectPath(projectRoot, "volumes"));
  if (chapterFiles.length === 0) {
    throw new ProjectError("当前项目中没有章节文件。");
  }

  if (!chapterInput) {
    return chapterFiles.sort().at(-1) as string;
  }

  const normalized = normalizeChapterId(chapterInput);
  const matched = chapterFiles.find((filePath) => normalizeChapterId(path.basename(filePath, ".md")) === normalized);
  if (!matched) {
    throw new ProjectError(`未找到章节文件: ${chapterInput}`);
  }

  return matched;
}

export async function resolveChapterBrief(projectRoot: string, chapterId: string): Promise<string | null> {
  const chapterBriefPath = path.join(projectPath(projectRoot, "chapterBriefs"), `${normalizeChapterId(chapterId)}.md`);
  try {
    return await fs.readFile(chapterBriefPath, "utf8");
  } catch {
    return null;
  }
}

export function resolveWriteOutputPath(projectRoot: string, chapterId: string, volumeNumber: number): string {
  const normalizedId = normalizeChapterId(chapterId).replace(/^ch/u, "");
  const volumeDir = path.join(projectPath(projectRoot, "volumes"), `vol_${String(volumeNumber).padStart(2, "0")}`);
  const fileName = `ch_${normalizedId}.md`;
  return path.join(volumeDir, fileName);
}

async function walkMarkdownFiles(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const absolutePath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walkMarkdownFiles(absolutePath)));
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(absolutePath);
      }
    }

    return files;
  } catch {
    return [];
  }
}

function normalizeChapterId(input: string): string {
  const digits = input.replace(/\D+/gu, "");
  if (!digits) {
    return input.toLowerCase();
  }

  return `ch${digits.padStart(3, "0")}`;
}

function resolveProviderApiKey(config: ProjectConfig, provider: string): string | null {
  const models = [config.models.writer, config.models.reviewer, config.models.extractor, config.models.light, config.models.embedding];
  for (const model of models) {
    if (model.provider !== provider || !model.apiKeyEnv) {
      continue;
    }

    const value = process.env[model.apiKeyEnv];
    if (value) {
      return value;
    }
  }

  return null;
}
