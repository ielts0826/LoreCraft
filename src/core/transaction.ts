import fs from "node:fs/promises";
import path from "node:path";

import { PATHS } from "../shared/constants.js";
import { TransactionError } from "../shared/errors.js";
import type { DiffResult, Manifest, Operation, RecoveryReport } from "../shared/types.js";
import { ensureDir, exists, readJsonIfExists, readTextIfExists, sha256, writeJsonAtomic, writeTextAtomic } from "../shared/utils.js";
import { eventBus } from "./event-bus.js";
import { assertPathInProject, classifyOperationRisk } from "./permissions.js";

interface TransactionStatus {
  state: "planning" | "staging" | "committed" | "rolled_back" | "failed";
  description: string;
  updatedAt: string;
}

function relativeTarget(projectRoot: string, targetPath: string): string {
  const absolutePath = path.resolve(projectRoot, targetPath);
  assertPathInProject(absolutePath, projectRoot);
  return path.relative(projectRoot, absolutePath);
}

export class FileTransaction {
  public readonly id: string;
  public readonly description: string;
  public status: TransactionStatus["state"] = "planning";

  private readonly txnRoot: string;
  private readonly manifestPath: string;
  private readonly statusPath: string;
  private readonly stagedRoot: string;
  private readonly backupRoot: string;
  private readonly plannedOperations: Operation[] = [];
  private readonly afterContents = new Map<string, string | null>();

  public constructor(
    private readonly projectRoot: string,
    description: string,
    id = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  ) {
    this.id = id;
    this.description = description;
    this.txnRoot = path.join(projectRoot, PATHS.transactions, id);
    this.manifestPath = path.join(this.txnRoot, "manifest.json");
    this.statusPath = path.join(this.txnRoot, "status.json");
    this.stagedRoot = path.join(this.txnRoot, "staged");
    this.backupRoot = path.join(this.txnRoot, "backup");
  }

  public async initialize(): Promise<void> {
    await ensureDir(this.txnRoot);
    await ensureDir(this.stagedRoot);
    await ensureDir(this.backupRoot);
    await this.writeManifest();
    await this.writeStatus("planning");
  }

  public plan(operations: Operation[]): void {
    this.ensureMutable();
    this.plannedOperations.splice(0, this.plannedOperations.length, ...operations);
  }

  public async stage(targetPath: string, content: string, reason = "staged update"): Promise<void> {
    this.ensureMutable();
    const relative = relativeTarget(this.projectRoot, targetPath);
    await this.backupIfNeeded(relative);

    this.upsertOperation({
      type: (await exists(path.join(this.projectRoot, relative))) ? "update" : "create",
      target: relative,
      content,
      riskLevel: classifyOperationRisk(relative, (await exists(path.join(this.projectRoot, relative))) ? "update" : "create"),
      reason,
      requiresConfirmation: false,
    });

    await writeTextAtomic(path.join(this.stagedRoot, relative), content);
    this.afterContents.set(relative, content);
    await this.writeManifest();
    await this.writeStatus("staging");
  }

  public async remove(targetPath: string, reason = "staged delete"): Promise<void> {
    this.ensureMutable();
    const relative = relativeTarget(this.projectRoot, targetPath);
    await this.backupIfNeeded(relative);

    this.upsertOperation({
      type: "delete",
      target: relative,
      riskLevel: classifyOperationRisk(relative, "delete"),
      reason,
      requiresConfirmation: true,
    });

    this.afterContents.set(relative, null);
    await this.writeManifest();
    await this.writeStatus("staging");
  }

  public async commit(): Promise<void> {
    this.ensureMutable();

    try {
      for (const operation of this.plannedOperations) {
        const absoluteTarget = path.join(this.projectRoot, operation.target);
        if (operation.type === "delete") {
          if (await exists(absoluteTarget)) {
            await fs.rm(absoluteTarget, { force: true });
          }
          continue;
        }

        const stagedPath = path.join(this.stagedRoot, operation.target);
        const stagedContent = await readTextIfExists(stagedPath);
        if (stagedContent === null) {
          throw new TransactionError(`缺少 staged 内容: ${operation.target}`);
        }

        await writeTextAtomic(absoluteTarget, stagedContent);
      }

      this.status = "committed";
      await this.writeManifest();
      await this.writeStatus("committed");
      eventBus.emit("transaction:committed", { txnId: this.id });
    } catch (error) {
      this.status = "failed";
      await this.writeStatus("failed");
      await this.rollback();
      throw new TransactionError(`事务提交失败: ${this.id}`, error);
    }
  }

  public async rollback(): Promise<void> {
    for (const operation of this.plannedOperations) {
      const absoluteTarget = path.join(this.projectRoot, operation.target);
      const backupPath = path.join(this.backupRoot, operation.target);
      const backupContent = await readTextIfExists(backupPath);

      if (backupContent !== null) {
        await writeTextAtomic(absoluteTarget, backupContent);
        continue;
      }

      if (await exists(absoluteTarget)) {
        await fs.rm(absoluteTarget, { force: true });
      }
    }

    this.status = "rolled_back";
    await this.writeStatus("rolled_back");
    eventBus.emit("transaction:rolled-back", { txnId: this.id });
  }

  public async getDiff(): Promise<DiffResult[]> {
    const diffs: DiffResult[] = [];
    for (const operation of this.plannedOperations) {
      const absoluteTarget = path.join(this.projectRoot, operation.target);
      const oldContent = await readTextIfExists(absoluteTarget);
      diffs.push({
        target: operation.target,
        type: operation.type,
        oldContent,
        newContent: this.afterContents.get(operation.target) ?? null,
      });
    }

    return diffs;
  }

  public async getManifest(): Promise<Manifest> {
    const manifest = await readJsonIfExists<Manifest>(this.manifestPath);
    if (manifest === null) {
      throw new TransactionError(`事务清单不存在: ${this.id}`);
    }

    return manifest;
  }

  private ensureMutable(): void {
    if (this.status === "committed" || this.status === "rolled_back") {
      throw new TransactionError(`事务已结束，不能继续修改: ${this.id}`);
    }
  }

  private async backupIfNeeded(relative: string): Promise<void> {
    const absolute = path.join(this.projectRoot, relative);
    const backupPath = path.join(this.backupRoot, relative);

    if (await exists(backupPath)) {
      return;
    }

    const content = await readTextIfExists(absolute);
    if (content !== null) {
      await writeTextAtomic(backupPath, content);
    }
  }

  private upsertOperation(operation: Operation): void {
    const existingIndex = this.plannedOperations.findIndex((item) => item.target === operation.target);
    if (existingIndex >= 0) {
      this.plannedOperations[existingIndex] = operation;
      return;
    }

    this.plannedOperations.push(operation);
  }

  private async writeManifest(): Promise<void> {
    const beforeHashes: Record<string, string> = {};
    const afterHashes: Record<string, string> = {};

    for (const operation of this.plannedOperations) {
      const absoluteTarget = path.join(this.projectRoot, operation.target);
      const beforeContent = await readTextIfExists(absoluteTarget);
      const afterContent = this.afterContents.get(operation.target) ?? operation.content ?? null;

      if (beforeContent !== null) {
        beforeHashes[operation.target] = sha256(beforeContent);
      }
      if (afterContent !== null) {
        afterHashes[operation.target] = sha256(afterContent);
      }
    }

    const manifest: Manifest = {
      transactionId: this.id,
      timestamp: new Date().toISOString(),
      operations: [...this.plannedOperations],
      beforeHashes,
      afterHashes,
    };

    await writeJsonAtomic(this.manifestPath, manifest);
  }

  private async writeStatus(state: TransactionStatus["state"]): Promise<void> {
    this.status = state;
    const payload: TransactionStatus = {
      state,
      description: this.description,
      updatedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(this.statusPath, payload);
  }
}

export class TransactionManager {
  public async begin(projectRoot: string, description: string): Promise<FileTransaction> {
    const transaction = new FileTransaction(projectRoot, description);
    await transaction.initialize();
    return transaction;
  }

  public async recoverStale(projectRoot: string): Promise<RecoveryReport> {
    const transactionsRoot = path.join(projectRoot, PATHS.transactions);
    if (!(await exists(transactionsRoot))) {
      return { recovered: [] };
    }

    const entries = await fs.readdir(transactionsRoot, { withFileTypes: true });
    const recovered: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const txnId = entry.name;
      const statusPath = path.join(transactionsRoot, txnId, "status.json");
      const status = await readJsonIfExists<TransactionStatus>(statusPath);
      if (status?.state !== "staging") {
        continue;
      }

      const manifestPath = path.join(transactionsRoot, txnId, "manifest.json");
      const manifest = await readJsonIfExists<Manifest>(manifestPath);
      if (manifest === null) {
        continue;
      }
      for (const operation of manifest.operations) {
        const absoluteTarget = path.join(projectRoot, operation.target);
        const backupPath = path.join(transactionsRoot, txnId, "backup", operation.target);
        const backupContent = await readTextIfExists(backupPath);

        if (backupContent !== null) {
          await writeTextAtomic(absoluteTarget, backupContent);
          continue;
        }

        if (await exists(absoluteTarget)) {
          await fs.rm(absoluteTarget, { force: true });
        }
      }

      const rolledBackStatus: TransactionStatus = {
        state: "rolled_back",
        description: status.description,
        updatedAt: new Date().toISOString(),
      };
      await writeJsonAtomic(statusPath, rolledBackStatus);
      eventBus.emit("transaction:rolled-back", { txnId });
      recovered.push(txnId);
    }

    return { recovered };
  }
}
