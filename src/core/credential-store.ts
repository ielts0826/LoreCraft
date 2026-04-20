import os from "node:os";
import path from "node:path";

import { readJsonIfExists, writeJsonAtomic } from "../shared/utils.js";
import type { ModelConfig, TextModelRole } from "../shared/types.js";

interface CredentialRecord {
  apiKey: string;
  updatedAt: string;
}

interface CredentialStoreFile {
  schemaVersion: 1;
  credentials: Record<string, CredentialRecord>;
  modelDefaults?: Partial<Record<TextModelRole, ModelDefaultRecord>> | undefined;
}

export interface ModelDefaultRecord extends ModelConfig {
  updatedAt: string;
}

const DEFAULT_DATA: CredentialStoreFile = {
  schemaVersion: 1,
  credentials: {},
  modelDefaults: {},
};

export class CredentialStore {
  public constructor(private readonly filePath = getDefaultCredentialStorePath()) {}

  public get path(): string {
    return this.filePath;
  }

  public async get(id: string): Promise<string | null> {
    const data = await this.read();
    return data.credentials[id]?.apiKey ?? null;
  }

  public async set(id: string, apiKey: string): Promise<void> {
    const data = await this.read();
    data.credentials[id] = {
      apiKey,
      updatedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(this.filePath, data);
  }

  public async list(): Promise<Array<{ id: string; updatedAt: string }>> {
    const data = await this.read();
    return Object.entries(data.credentials)
      .map(([id, record]) => ({ id, updatedAt: record.updatedAt }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public async getModelDefault(role: TextModelRole): Promise<ModelDefaultRecord | null> {
    const data = await this.read();
    return data.modelDefaults?.[role] ?? null;
  }

  public async setModelDefault(role: TextModelRole, config: ModelConfig): Promise<void> {
    const data = await this.read();
    data.modelDefaults = data.modelDefaults ?? {};
    data.modelDefaults[role] = {
      ...config,
      updatedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(this.filePath, data);
  }

  public async listModelDefaults(): Promise<Partial<Record<TextModelRole, ModelDefaultRecord>>> {
    const data = await this.read();
    return data.modelDefaults ?? {};
  }

  private async read(): Promise<CredentialStoreFile> {
    return (await readJsonIfExists<CredentialStoreFile>(this.filePath)) ?? structuredClone(DEFAULT_DATA);
  }
}

export function getDefaultCredentialStorePath(): string {
  const appData = process.env.APPDATA;
  if (appData) {
    return path.join(appData, "LoreCraft", "credentials.json");
  }

  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    return path.join(xdg, "lorecraft", "credentials.json");
  }

  return path.join(os.homedir(), ".lorecraft", "credentials.json");
}
