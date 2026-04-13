import { describe, expect, it } from "bun:test";
import { ToolRegistry } from "./registry.js";
import type { Tool } from "./types.js";

const makeTool = (name: string): Tool => ({
  name,
  description: `A test tool named ${name}`,
  inputSchema: {
    type: "object",
    properties: {
      value: { type: "string", description: "A string value" },
    },
    required: ["value"],
  },
  async execute(_input: unknown): Promise<string> {
    return "ok";
  },
});

describe("ToolRegistry", () => {
  it("registers a tool and retrieves it by name", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("my-tool");
    registry.register(tool);
    expect(registry.get("my-tool")).toBe(tool);
  });

  it("returns null for an unknown tool name", () => {
    const registry = new ToolRegistry();
    expect(registry.get("nonexistent")).toBeNull();
  });

  it("list() returns array with correct Anthropic shape", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("list-tool");
    registry.register(tool);

    const listed = registry.list();
    expect(listed).toHaveLength(1);

    const item = listed[0];
    expect(item).toBeDefined();
    expect(item?.name).toBe("list-tool");
    expect(item?.description).toBe("A test tool named list-tool");
    expect(item?.input_schema).toBeDefined();
    expect(item?.input_schema.type).toBe("object");
    expect(item?.input_schema.properties).toEqual({
      value: { type: "string", description: "A string value" },
    });
  });

  it("throws Error with correct message when registering a duplicate name", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("dup-tool");
    registry.register(tool);
    expect(() => registry.register(makeTool("dup-tool"))).toThrow(
      "Tool already registered: dup-tool",
    );
  });
});
