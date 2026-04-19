import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";

import { PATHS } from "../shared/constants.js";
import { readTextIfExists, sha256 } from "../shared/utils.js";
import type { Tokenizer } from "./tokenizer.js";

type SqliteDatabase = DatabaseSync;

export type MemoryLayer = "canon" | "outline" | "continuity" | "manuscript";

export interface IndexedDocument {
  filePath: string;
  layer: MemoryLayer;
  category: string;
  title: string;
  rawContent: string;
  tokenizedContent: string;
  hash: string;
  indexedAt: string;
}

export interface IndexerSearchInput {
  query: string;
  layers?: MemoryLayer[] | undefined;
  categories?: string[] | undefined;
  maxResults?: number;
}

export interface IndexedSearchResult extends IndexedDocument {
  bm25Score: number;
  matchType: "bm25" | "fallback";
}

export interface ReindexOptions {
  full?: boolean;
  embeddingModelId?: string;
}

interface NormalizedSearchInput {
  query: string;
  layers: MemoryLayer[];
  categories: string[];
  maxResults: number;
}

export class StoryIndexer {
  private db: SqliteDatabase | null = null;
  private ftsEnabled = true;

  public constructor(
    private readonly projectRoot: string,
    private readonly tokenizer: Tokenizer,
  ) {}

  public async reindexAll(options: ReindexOptions = {}): Promise<void> {
    this.tokenizer.init();
    const database = this.getDb();
    const files = await this.collectIndexableFiles();
    const existingRows = database.prepare("SELECT file_path AS filePath, hash FROM documents").all() as unknown as Array<{
      filePath: string;
      hash: string;
    }>;
    const existingHashes = new Map(existingRows.map((row) => [row.filePath, row.hash]));
    const alivePaths = new Set<string>();

    if (options.full) {
      database.exec(`
        DELETE FROM documents;
        DELETE FROM embeddings;
        DELETE FROM index_meta;
      `);
      if (this.ftsEnabled) {
        database.exec("DELETE FROM fts_documents;");
      }
    }

    if (options.embeddingModelId) {
      database
        .prepare("INSERT OR REPLACE INTO index_meta(key, value) VALUES('embedding_model', ?)")
        .run(options.embeddingModelId);
    }

    for (const filePath of files) {
      const content = (await readTextIfExists(filePath)) ?? "";
      const hash = sha256(content);
      alivePaths.add(filePath);

      if (!options.full && existingHashes.get(filePath) === hash) {
        continue;
      }

      this.indexDocument(filePath, content, hash);
    }

    for (const existingPath of existingHashes.keys()) {
      if (!alivePaths.has(existingPath)) {
        this.removeFile(existingPath);
      }
    }
  }

  public indexDocument(filePath: string, content: string, hash = sha256(content)): void {
    const database = this.getDb();
    const metadata = classifyDocument(this.projectRoot, filePath, content);
    const tokenizedContent = this.tokenizer.tokenize(content);
    const indexedAt = new Date().toISOString();

    database
      .prepare(
        `INSERT OR REPLACE INTO documents (
          file_path, layer, category, title, raw_content, tokenized_content, hash, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(filePath, metadata.layer, metadata.category, metadata.title, content, tokenizedContent, hash, indexedAt);

    if (this.ftsEnabled) {
      database.prepare("DELETE FROM fts_documents WHERE file_path = ?").run(filePath);
      database
        .prepare("INSERT INTO fts_documents(file_path, layer, category, content) VALUES (?, ?, ?, ?)")
        .run(filePath, metadata.layer, metadata.category, tokenizedContent);
    }
  }

  public removeFile(filePath: string): void {
    const database = this.getDb();
    database.prepare("DELETE FROM documents WHERE file_path = ?").run(filePath);
    if (this.ftsEnabled) {
      database.prepare("DELETE FROM fts_documents WHERE file_path = ?").run(filePath);
    }
  }

  public getDocuments(): IndexedDocument[] {
    return this.getDb()
      .prepare(
        `SELECT
          file_path AS filePath,
          layer,
          category,
          title,
          raw_content AS rawContent,
          tokenized_content AS tokenizedContent,
          hash,
          indexed_at AS indexedAt
         FROM documents
         ORDER BY file_path ASC`,
      )
      .all() as unknown as IndexedDocument[];
  }

  public search(input: IndexerSearchInput): IndexedSearchResult[] {
    const normalized = normalizeSearchInput(input);
    if (!normalized.query) {
      return [];
    }

    const ftsResults = this.ftsEnabled ? this.searchWithFts(normalized) : [];
    if (ftsResults.length > 0) {
      return ftsResults;
    }

    return this.searchFallback(normalized);
  }

  public close(): void {
    if (this.db !== null) {
      this.db.close();
      this.db = null;
    }
  }

  private async collectIndexableFiles(): Promise<string[]> {
    const roots = [path.join(this.projectRoot, PATHS.storyBible), path.join(this.projectRoot, PATHS.manuscript)];
    const collected = new Set<string>();

    for (const root of roots) {
      const items = await walkTextFiles(root);
      for (const item of items) {
        collected.add(item);
      }
    }

    return [...collected];
  }

  private getDb(): SqliteDatabase {
    if (this.db !== null) {
      return this.db;
    }

    const databasePath = path.join(this.projectRoot, PATHS.retrievalIndex);
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = openIndexDatabase(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        file_path         TEXT PRIMARY KEY,
        layer             TEXT NOT NULL,
        category          TEXT NOT NULL,
        title             TEXT NOT NULL,
        raw_content       TEXT NOT NULL,
        tokenized_content TEXT NOT NULL,
        hash              TEXT NOT NULL,
        indexed_at        TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS embeddings (
        chunk_id     TEXT PRIMARY KEY,
        source_file  TEXT NOT NULL,
        layer        TEXT NOT NULL,
        chunk_text   TEXT NOT NULL,
        embedding    BLOB NOT NULL,
        model_id     TEXT NOT NULL,
        metadata     TEXT,
        created_at   TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS index_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_documents_layer ON documents(layer);
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
      CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(hash);
    `);

    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS fts_documents USING fts5(
          file_path UNINDEXED,
          layer UNINDEXED,
          category UNINDEXED,
          content,
          tokenize='unicode61'
        );
      `);
      this.ftsEnabled = true;
    } catch {
      this.ftsEnabled = false;
    }

    return this.db;
  }

  private searchWithFts(input: NormalizedSearchInput): IndexedSearchResult[] {
    const database = this.getDb();
    const whereClauses = ["fts_documents.content MATCH ?"];
    const params: SQLInputValue[] = [this.tokenizer.tokenizeQuery(input.query)];

    if (input.layers.length > 0) {
      whereClauses.push(`d.layer IN (${input.layers.map(() => "?").join(", ")})`);
      params.push(...input.layers);
    }

    if (input.categories.length > 0) {
      whereClauses.push(`d.category IN (${input.categories.map(() => "?").join(", ")})`);
      params.push(...input.categories);
    }

    params.push(input.maxResults);
    const rows = database
      .prepare(
        `SELECT
          d.file_path AS filePath,
          d.layer AS layer,
          d.category AS category,
          d.title AS title,
          d.raw_content AS rawContent,
          d.tokenized_content AS tokenizedContent,
          d.hash AS hash,
          d.indexed_at AS indexedAt,
          bm25(fts_documents) AS bm25Score
         FROM fts_documents
         JOIN documents d ON d.file_path = fts_documents.file_path
         WHERE ${whereClauses.join(" AND ")}
         ORDER BY bm25(fts_documents)
         LIMIT ?`,
      )
      .all(...params) as unknown as Array<IndexedSearchResult & { bm25Score: number }>;

    return rows.map((row) => ({
      ...row,
      bm25Score: normalizeBm25(row.bm25Score),
      matchType: "bm25",
    }));
  }

  private searchFallback(input: NormalizedSearchInput): IndexedSearchResult[] {
    const tokens = this.tokenizer
      .tokenizeQuery(input.query)
      .split(" ")
      .filter(Boolean);
    if (tokens.length === 0) {
      return [];
    }

    const documents = this.getDocuments().filter((document) => {
      const layerOk = input.layers.length === 0 || input.layers.includes(document.layer);
      const categoryOk = input.categories.length === 0 || input.categories.includes(document.category);
      return layerOk && categoryOk;
    });

    return documents
      .map((document) => {
        const score = tokens.reduce((sum, token) => sum + countOccurrences(document.tokenizedContent, token), 0) / tokens.length;
        return {
          ...document,
          bm25Score: score,
          matchType: "fallback" as const,
        };
      })
      .filter((document) => document.bm25Score > 0)
      .sort((left, right) => right.bm25Score - left.bm25Score)
      .slice(0, input.maxResults);
  }
}

async function walkTextFiles(root: string): Promise<string[]> {
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = await fsp.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkTextFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
      files.push(absolutePath);
    }
  }

  return files;
}

function openIndexDatabase(filePath: string) {
  const database = new DatabaseSync(filePath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return database;
}

function normalizeSearchInput(input: IndexerSearchInput): NormalizedSearchInput {
  return {
    query: input.query.trim(),
    layers: input.layers ?? [],
    categories: input.categories ?? [],
    maxResults: input.maxResults ?? 10,
  };
}

function classifyDocument(projectRoot: string, filePath: string, content: string): {
  layer: MemoryLayer;
  category: string;
  title: string;
} {
  const relative = path.relative(projectRoot, filePath).replaceAll("\\", "/");
  const title = extractTitle(content, filePath);

  if (relative.startsWith("story_bible/canon/")) {
    return { layer: "canon", category: inferCategory(relative), title };
  }
  if (relative.startsWith("story_bible/outlines/")) {
    return { layer: "outline", category: inferCategory(relative), title };
  }
  if (relative.startsWith("story_bible/continuity/")) {
    return { layer: "continuity", category: inferCategory(relative), title };
  }

  return { layer: "manuscript", category: "chapter", title };
}

function extractTitle(content: string, filePath: string): string {
  const heading = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/u, "").trim() : path.basename(filePath, path.extname(filePath));
}

function inferCategory(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.includes("/characters/")) {
    return "character";
  }
  if (normalized.includes("/factions/")) {
    return "faction";
  }
  if (normalized.includes("/locations/")) {
    return "location";
  }
  if (normalized.includes("/world/")) {
    return "world";
  }
  if (normalized.includes("/volume_plans/")) {
    return "volume";
  }
  if (normalized.includes("/chapter_briefs/")) {
    return "chapter";
  }
  return "general";
}

function countOccurrences(text: string, token: string): number {
  return text.split(" ").filter((item) => item === token).length;
}

function normalizeBm25(rawScore: number): number {
  if (!Number.isFinite(rawScore)) {
    return 0;
  }

  return 1 / (1 + Math.abs(rawScore));
}
