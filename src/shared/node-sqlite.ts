import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncInstance, SQLInputValue } from "node:sqlite";

const require = createRequire(import.meta.url);
const NODE_SQLITE_SPECIFIER = "node:sqlite";
type DatabaseSyncConstructor = new (location: string) => DatabaseSyncInstance;
const nodeSqlite = require(NODE_SQLITE_SPECIFIER) as { DatabaseSync: DatabaseSyncConstructor };

export const { DatabaseSync } = nodeSqlite;
export type { SQLInputValue };
