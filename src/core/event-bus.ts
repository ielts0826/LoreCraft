import { EventEmitter } from "node:events";

import type { ProjectStatus } from "../shared/types.js";

export interface Proposal {
  title: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
}

export interface AppEventMap {
  "project:loaded": { status: ProjectStatus };
  "agent:status": { message: string };
  warning: { message: string };
  "confirm:request": { proposal: Proposal };
  "confirm:response": { approved: boolean };
  "transaction:committed": { txnId: string };
  "transaction:rolled-back": { txnId: string };
}

export class TypedEventBus {
  private readonly emitter = new EventEmitter();

  public on<K extends keyof AppEventMap>(
    eventName: K,
    listener: (payload: AppEventMap[K]) => void,
  ): () => void {
    this.emitter.on(eventName, listener as (...args: unknown[]) => void);
    return () => {
      this.emitter.off(eventName, listener as (...args: unknown[]) => void);
    };
  }

  public emit<K extends keyof AppEventMap>(eventName: K, payload: AppEventMap[K]): void {
    this.emitter.emit(eventName, payload);
  }
}

export const eventBus = new TypedEventBus();
