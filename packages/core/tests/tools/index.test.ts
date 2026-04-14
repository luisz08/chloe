import { describe, expect, it } from "bun:test";
import { DEFAULT_TOOL_SETTINGS, createDefaultTools } from "../../src/tools/index.js";

describe("createDefaultTools", () => {
  const cwd = process.cwd();
  const settings = DEFAULT_TOOL_SETTINGS(cwd);
  const tools = createDefaultTools(settings, cwd);

  it("returns exactly 3 tools", () => {
    expect(tools).toHaveLength(3);
  });

  it("includes bash, read_file, write_file", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("bash");
    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
  });

  it("does NOT include echo", () => {
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("echo");
  });

  it("all tools have a non-empty description", () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("all tools have required inputSchema fields", () => {
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });
});
