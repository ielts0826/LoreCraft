export type CreativeMode = "assisted" | "manual" | "auto";

export type RiskLevel = "low" | "medium" | "high";

export interface ModelConfig {
  provider: string;
  modelId: string;
  apiKeyEnv?: string | undefined;
  baseUrl?: string | undefined;
}

export interface EmbeddingModelConfig extends ModelConfig {
  provider: "siliconflow";
  dimension: number;
}

export interface ProjectConfig {
  schemaVersion: 1;
  name: string;
  genre: string;
  creativeMode: CreativeMode;
  models: {
    writer: ModelConfig;
    reviewer: ModelConfig;
    extractor: ModelConfig;
    light: ModelConfig;
    embedding: EmbeddingModelConfig;
  };
  style: {
    referenceFile?: string | undefined;
  };
  sandbox: {
    mode: "restricted" | "workspace-write";
    allowNetwork: boolean;
  };
}

export interface CanonStats {
  characters: number;
  locations: number;
  factions: number;
  totalEntities: number;
}

export interface LastSessionInfo {
  date: Date;
  headline: string;
  summary: string;
}

export interface ProjectStatus {
  currentVolume: number;
  currentChapter: number;
  totalChaptersPlanned: number;
  canonStats: CanonStats;
  openForeshadowing: number;
  pendingConfirmations: number;
  lastSession: LastSessionInfo | null;
}

export interface Project {
  root: string;
  config: ProjectConfig;
}

export interface CreateProjectOptions {
  baseDir?: string;
  inPlace?: boolean;
  genre?: string;
}

export interface Operation {
  type: "create" | "update" | "delete";
  target: string;
  content?: string;
  riskLevel: RiskLevel;
  reason: string;
  requiresConfirmation: boolean;
}

export interface Manifest {
  transactionId: string;
  timestamp: string;
  operations: Operation[];
  beforeHashes: Record<string, string>;
  afterHashes: Record<string, string>;
}

export interface DiffResult {
  target: string;
  type: Operation["type"];
  oldContent: string | null;
  newContent: string | null;
}

export interface RecoveryReport {
  recovered: string[];
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  commandType?: string | undefined;
}

export interface SessionContext {
  summary: string;
  recentTurns: Turn[];
  totalTokensEstimate: number;
}

export interface SessionSummary {
  date: string;
  duration: number;
  headline: string;
  chaptersWritten: string[];
  decisionsConfirmed: number;
  foreshadowingAdded: number;
  fullSummary: string;
}
