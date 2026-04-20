import fs from "node:fs/promises";
import path from "node:path";

import { ensureDir } from "../shared/utils.js";

export interface RunLogEvent {
  type: string;
  timestamp?: string | undefined;
  [key: string]: unknown;
}

export class RunLogger {
  public constructor(private readonly projectRoot: string) {}

  public async write(event: RunLogEvent): Promise<void> {
    const logDir = path.join(this.projectRoot, ".agent", "logs");
    await ensureDir(logDir);
    const filePath = path.join(logDir, `session-${new Date().toISOString().slice(0, 10)}.jsonl`);
    await fs.appendFile(
      filePath,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...event,
      })}\n`,
      "utf8",
    );
  }
}
