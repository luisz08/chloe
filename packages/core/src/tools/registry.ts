import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages";
import type { Tool } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private callingTool: string | null = null;

  /**
   * Set the name of the currently executing tool (for recursion prevention).
   */
  setCallingTool(name: string | null): void {
    this.callingTool = name;
  }

  /**
   * Get the name of the currently executing tool.
   */
  getCallingTool(): string | null {
    return this.callingTool;
  }

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | null {
    return this.tools.get(name) ?? null;
  }

  list(): AnthropicTool[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object" as const,
        properties: tool.inputSchema.properties,
        ...(tool.inputSchema.required !== undefined ? { required: tool.inputSchema.required } : {}),
      },
    }));
  }
}
