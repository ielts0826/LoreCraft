export interface ToolExecutionContext {
  projectRoot: string;
}

export interface ToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  execute(args: TArgs, context: ToolExecutionContext): Promise<TResult>;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  tool: string;
  args: Record<string, unknown>;
  status: "success" | "failed";
  result?: unknown;
  error?: string;
}
