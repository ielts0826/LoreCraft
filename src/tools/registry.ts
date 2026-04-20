import type { ToolCall, ToolDefinition, ToolExecutionContext, ToolResult } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  public register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  public async execute(call: ToolCall, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.tools.get(call.tool);
    if (!tool) {
      return {
        tool: call.tool,
        args: call.args,
        status: "failed",
        error: `Unknown tool: ${call.tool}`,
      };
    }

    try {
      return {
        tool: call.tool,
        args: call.args,
        status: "success",
        result: await tool.execute(call.args, context),
      };
    } catch (error) {
      return {
        tool: call.tool,
        args: call.args,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
