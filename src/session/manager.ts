import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import { projectPath } from "../shared/constants.js";
import type { Project, SessionContext, SessionSummary, Turn } from "../shared/types.js";
import { ensureDir, estimateTokens, exists, readTextIfExists, writeTextAtomic } from "../shared/utils.js";

const RECENT_TURN_LIMIT = 6;
const SUMMARY_COMPACT_THRESHOLD = 1_200;

export class SessionManager {
  private summary = "";
  private recentTurns: Turn[] = [];
  private allTurns: Turn[] = [];
  private loadedSummary: SessionSummary | null = null;

  public async loadLastSummary(project: Project): Promise<void> {
    const latest = await this.getLatestSummary(project.root);
    this.loadedSummary = latest;
    this.summary = latest?.fullSummary ?? "";
    this.recentTurns = [];
    this.allTurns = [];
  }

  public addTurn(role: "user" | "assistant", content: string, commandType?: string): void {
    const turn: Turn = {
      role,
      content,
      timestamp: new Date(),
      commandType,
    };
    this.recentTurns.push(turn);
    this.allTurns.push(turn);
    if (this.recentTurns.length > RECENT_TURN_LIMIT) {
      const overflow = this.recentTurns.splice(0, this.recentTurns.length - RECENT_TURN_LIMIT);
      this.summary = compactTurnsIntoSummary(this.summary, overflow);
    }
  }

  public getContext(): SessionContext {
    return {
      summary: this.summary,
      recentTurns: [...this.recentTurns],
      totalTokensEstimate: estimateTokens(this.summary + turnsToText(this.recentTurns)),
    };
  }

  public compactIfNeeded(): void {
    const currentEstimate = estimateTokens(this.summary + turnsToText(this.recentTurns));
    if (currentEstimate <= SUMMARY_COMPACT_THRESHOLD || this.recentTurns.length <= 3) {
      return;
    }

    const compacted = this.recentTurns.splice(0, 3);
    this.summary = compactTurnsIntoSummary(this.summary, compacted);
  }

  public async saveOnExit(project: Project): Promise<void> {
    const sessionSummary: SessionSummary = {
      date: new Date().toISOString(),
      duration: 0,
      headline: buildHeadline(this.allTurns),
      chaptersWritten: extractChaptersWritten(this.allTurns),
      decisionsConfirmed: countKeywordMatches(this.allTurns, ["approve", "confirmed", "accepted"]),
      foreshadowingAdded: countKeywordMatches(this.allTurns, ["伏笔", "foreshadow"]),
      fullSummary: compactTurnsIntoSummary(this.summary, this.allTurns),
    };

    const outputPath = path.join(
      projectPath(project.root, "sessionSummaries"),
      `${sessionSummary.date.slice(0, 10)}_session.yaml`,
    );
    await ensureDir(path.dirname(outputPath));
    await writeTextAtomic(outputPath, YAML.stringify(sessionSummary));
  }

  public async getLatestSummary(root: string): Promise<SessionSummary | null> {
    const summariesDir = projectPath(root, "sessionSummaries");
    if (!(await exists(summariesDir))) {
      return null;
    }

    const entries = await fs.readdir(summariesDir);
    const latest = entries.filter((entry) => entry.endsWith(".yaml")).sort().at(-1);
    if (!latest) {
      return null;
    }

    const raw = await readTextIfExists(path.join(summariesDir, latest));
    if (raw === null) {
      return null;
    }

    return YAML.parse(raw) as SessionSummary;
  }
}

function compactTurnsIntoSummary(existingSummary: string, turns: Turn[]): string {
  const lines = turns.map((turn) => `[${turn.role}] ${turn.content.trim()}`).filter(Boolean);
  const merged = [existingSummary.trim(), ...lines].filter(Boolean).join("\n");
  return merged.length > 2_000 ? merged.slice(merged.length - 2_000) : merged;
}

function turnsToText(turns: Turn[]): string {
  return turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
}

function buildHeadline(turns: Turn[]): string {
  const lastTurn = turns.at(-1)?.content.trim();
  if (!lastTurn) {
    return "空会话";
  }

  return lastTurn.length <= 60 ? lastTurn : `${lastTurn.slice(0, 57)}...`;
}

function extractChaptersWritten(turns: Turn[]): string[] {
  const matches = new Set<string>();
  const regex = /\b(ch[_-]?\d+)\b/giu;

  for (const turn of turns) {
    const turnMatches = turn.content.matchAll(regex);
    for (const match of turnMatches) {
      const chapter = match[1];
      if (chapter) {
        matches.add(chapter.toLowerCase());
      }
    }
  }

  return [...matches];
}

function countKeywordMatches(turns: Turn[], keywords: string[]): number {
  let count = 0;
  const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());

  for (const turn of turns) {
    const content = turn.content.toLowerCase();
    if (loweredKeywords.some((keyword) => content.includes(keyword))) {
      count += 1;
    }
  }

  return count;
}
