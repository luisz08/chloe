import { describe, expect, it } from "bun:test";
import { DEFAULT_TOOL_SETTINGS, createDefaultTools } from "./index.js";

describe("createDefaultTools", () => {
  const cwd = process.cwd();
  const settings = DEFAULT_TOOL_SETTINGS(cwd);
  const tools = createDefaultTools(settings, cwd);

  it("returns exactly 4 tools (bash, read_file, write_file, web_fetch)", () => {
    expect(tools).toHaveLength(4);
  });

  it("includes bash, read_file, write_file, web_fetch", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("bash");
    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("web_fetch");
  });

  it("does not include web_search when no searchConfig provided", () => {
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("web_search");
  });

  it("includes web_search when searchConfig is provided", () => {
    const withSearch = createDefaultTools(settings, cwd, undefined, { provider: "duckduckgo" });
    const names = withSearch.map((t) => t.name);
    expect(names).toContain("web_search");
    expect(withSearch).toHaveLength(5);
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
