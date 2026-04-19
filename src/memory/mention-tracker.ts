import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";

import { mentionRecordSchema, type MentionRecord, type MentionType } from "./schema.js";

type SqliteDatabase = DatabaseSync;

export interface MentionFilter {
  entityType?: MentionType;
  tier?: 1 | 2 | 3;
  minOccurrences?: number;
}

export interface UpgradeCandidate extends MentionRecord {
  suggestedTier: 2 | 3;
}

export interface ConfirmUpgradeInput {
  tier: 2 | 3;
  canonFile?: string | null;
  description?: string | null;
}

export class MentionTracker {
  private db: SqliteDatabase | null = null;

  public constructor(private readonly dbPath: string) {}

  public recordMention(entity: string, type: MentionType, chapter: string, description?: string): MentionRecord {
    const normalizedEntity = entity.trim();
    const normalizedChapter = chapter.trim();
    const now = new Date().toISOString();
    const database = this.getDb();

    const existing = this.getMention(normalizedEntity, type);
    if (existing === null) {
      database
        .prepare(
          `INSERT INTO mentions (
            entity_name, entity_type, tier, first_chapter, last_chapter, occurrences,
            canon_file, description, created_at, updated_at
          ) VALUES (?, ?, 1, ?, ?, 1, NULL, ?, ?, ?)`,
        )
        .run(normalizedEntity, type, normalizedChapter, normalizedChapter, description ?? null, now, now);
    } else {
      database
        .prepare(
          `UPDATE mentions
           SET last_chapter = ?,
               occurrences = occurrences + 1,
               description = COALESCE(?, description),
               updated_at = ?
           WHERE entity_name = ? AND entity_type = ?`,
        )
        .run(normalizedChapter, description ?? null, now, normalizedEntity, type);
    }

    return this.getMention(normalizedEntity, type) as MentionRecord;
  }

  public getMention(entity: string, type: MentionType): MentionRecord | null {
    const row = this.getDb()
      .prepare(
        `SELECT
          entity_name AS entityName,
          entity_type AS entityType,
          tier,
          first_chapter AS firstChapter,
          last_chapter AS lastChapter,
          occurrences,
          canon_file AS canonFile,
          description,
          created_at AS createdAt,
          updated_at AS updatedAt
         FROM mentions
         WHERE entity_name = ? AND entity_type = ?`,
      )
      .get(entity.trim(), type) as MentionRecord | undefined;

    return row ? mentionRecordSchema.parse(row) : null;
  }

  public listMentions(filter: MentionFilter = {}): MentionRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];

    if (filter.entityType) {
      clauses.push("entity_type = ?");
      params.push(filter.entityType);
    }

    if (filter.tier) {
      clauses.push("tier = ?");
      params.push(filter.tier);
    }

    if (filter.minOccurrences) {
      clauses.push("occurrences >= ?");
      params.push(filter.minOccurrences);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.getDb()
      .prepare(
        `SELECT
          entity_name AS entityName,
          entity_type AS entityType,
          tier,
          first_chapter AS firstChapter,
          last_chapter AS lastChapter,
          occurrences,
          canon_file AS canonFile,
          description,
          created_at AS createdAt,
          updated_at AS updatedAt
         FROM mentions
         ${whereClause}
         ORDER BY occurrences DESC, updated_at DESC`,
      )
      .all(...params) as unknown as MentionRecord[];

    return rows.map((row) => mentionRecordSchema.parse(row));
  }

  public listUpgradeCandidates(minOccurrences = 3): UpgradeCandidate[] {
    return this.listMentions({ minOccurrences })
      .filter((record) => record.tier < 3 && record.canonFile === null)
      .map((record) => ({
        ...record,
        suggestedTier: record.tier >= 2 ? 3 : 2,
      }));
  }

  public confirmUpgrade(entity: string, type: MentionType, input: ConfirmUpgradeInput): MentionRecord {
    const now = new Date().toISOString();
    this.getDb()
      .prepare(
        `UPDATE mentions
         SET tier = ?, canon_file = ?, description = COALESCE(?, description), updated_at = ?
         WHERE entity_name = ? AND entity_type = ?`,
      )
      .run(input.tier, input.canonFile ?? null, input.description ?? null, now, entity.trim(), type);

    return this.getMention(entity, type) as MentionRecord;
  }

  public close(): void {
    if (this.db !== null) {
      this.db.close();
      this.db = null;
    }
  }

  private getDb(): SqliteDatabase {
    if (this.db !== null) {
      return this.db;
    }

    this.db = openMentionDatabase(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mentions (
        entity_name   TEXT NOT NULL,
        entity_type   TEXT NOT NULL,
        tier          INTEGER NOT NULL DEFAULT 1,
        first_chapter TEXT NOT NULL,
        last_chapter  TEXT NOT NULL,
        occurrences   INTEGER NOT NULL DEFAULT 1,
        canon_file    TEXT,
        description   TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        PRIMARY KEY (entity_name, entity_type)
      );
      CREATE INDEX IF NOT EXISTS idx_mentions_tier ON mentions(tier);
      CREATE INDEX IF NOT EXISTS idx_mentions_type ON mentions(entity_type);
      CREATE INDEX IF NOT EXISTS idx_mentions_occurrences ON mentions(occurrences);
    `);
    return this.db;
  }
}

function openMentionDatabase(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new DatabaseSync(filePath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return database;
}
