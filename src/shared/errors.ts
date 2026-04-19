export class LoreCraftError extends Error {
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = new.target.name;
  }
}

export class ProjectError extends LoreCraftError {}

export class PermissionError extends LoreCraftError {}

export class TransactionError extends LoreCraftError {}

export class ConfigError extends LoreCraftError {}
