import { buildOrchestratorSystemPrompt } from "../llm/prompts/system-orchestrator.js";
import type { LLMClient } from "../llm/client.js";

export type AgentIntent =
  | "write"
  | "check"
  | "lookup"
  | "plan"
  | "expand"
  | "rewrite"
  | "style_analyze"
  | "config"
  | "unknown";

export interface OrchestrationPlan {
  intent: AgentIntent;
  command: string;
  modules: string[];
  requiredContext: string[];
  riskLevel: "low" | "medium" | "high";
  needsConfirmation: boolean;
}

export interface ModelIntentAnalysisInput {
  provider: string;
  model: string;
  userIntent: string;
  projectStatus?: string | undefined;
  recentContext?: string | undefined;
}

export class OrchestratorAgent {
  public constructor(private readonly llmClient?: LLMClient) {}

  public analyzeIntent(command: string): OrchestrationPlan {
    const normalized = command.trim();

    if (normalized.startsWith("/write")) {
      return {
        intent: "write",
        command: normalized,
        modules: ["context-builder", "writer"],
        requiredContext: ["chapter brief", "style", "open loops", "related canon"],
        riskLevel: "medium",
        needsConfirmation: false,
      };
    }

    if (normalized.startsWith("/check")) {
      return {
        intent: "check",
        command: normalized,
        modules: ["context-builder", "reviewer"],
        requiredContext: ["chapter text", "related canon", "timeline", "open loops"],
        riskLevel: "low",
        needsConfirmation: false,
      };
    }

    if (normalized.startsWith("/lookup")) {
      return {
        intent: "lookup",
        command: normalized,
        modules: ["context-builder", "retriever"],
        requiredContext: ["query", "story memory"],
        riskLevel: "low",
        needsConfirmation: false,
      };
    }

    if (normalized.startsWith("/expand")) {
      return {
        intent: "expand",
        command: normalized,
        modules: ["orchestrator", "expand-planner", "transaction-manager"],
        requiredContext: ["outline", "existing canon", "open loops"],
        riskLevel: "high",
        needsConfirmation: true,
      };
    }

    if (normalized.startsWith("/plan")) {
      return {
        intent: "plan",
        command: normalized,
        modules: ["orchestrator", "planner"],
        requiredContext: ["idea", "existing canon", "existing outline"],
        riskLevel: "medium",
        needsConfirmation: true,
      };
    }

    if (normalized.startsWith("/rewrite")) {
      return {
        intent: "rewrite",
        command: normalized,
        modules: ["context-builder", "writer"],
        requiredContext: ["original text", "rewrite instruction", "style", "canon"],
        riskLevel: "medium",
        needsConfirmation: false,
      };
    }

    if (normalized.startsWith("/style analyze")) {
      return {
        intent: "style_analyze",
        command: normalized,
        modules: ["style-analyzer"],
        requiredContext: ["reference text", "existing style"],
        riskLevel: "medium",
        needsConfirmation: true,
      };
    }

    if (normalized.startsWith("/config")) {
      return {
        intent: "config",
        command: normalized,
        modules: ["config-manager"],
        requiredContext: ["config file"],
        riskLevel: "high",
        needsConfirmation: true,
      };
    }

    return {
      intent: "unknown",
      command: normalized,
      modules: ["orchestrator"],
      requiredContext: ["user clarification"],
      riskLevel: "low",
      needsConfirmation: false,
    };
  }

  public async analyzeWithModel(input: ModelIntentAnalysisInput): Promise<string> {
    if (!this.llmClient) {
      throw new Error("LLM client is required for model-based orchestration analysis.");
    }

    const systemPrompt = buildOrchestratorSystemPrompt({
      userIntent: input.userIntent,
      projectStatus: input.projectStatus,
      recentContext: input.recentContext,
    });

    const response = await this.llmClient.generate({
      provider: input.provider,
      model: input.model,
      temperature: 0.2,
      maxTokens: 1_500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: input.userIntent },
      ],
    });

    return response.content.trim();
  }
}
