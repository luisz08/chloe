import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createWebSearchTool } from "./web-search.js";

function makeSpawnResult(
  exitCode: number,
  stdout: string,
  stderr = "",
): ReturnType<typeof Bun.spawn> {
  return {
    exited: Promise.resolve(exitCode),
    exitCode,
    stdout: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(stdout));
        c.close();
      },
    }),
    stderr: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(stderr));
        c.close();
      },
    }),
  } as unknown as ReturnType<typeof Bun.spawn>;
}

function buildResults(count: number): string {
  return JSON.stringify(
    Array.from({ length: count }, (_, i) => ({
      title: `Result ${i + 1}`,
      url: `https://example.com/${i + 1}`,
      snippet: `Snippet ${i + 1}`,
    })),
  );
}

let spawnSpy: ReturnType<typeof spyOn<typeof Bun, "spawn">>;

beforeEach(() => {
  spawnSpy = spyOn(Bun, "spawn");
});

afterEach(() => {
  spawnSpy.mockRestore();
});

// Simulate python3 found, ddgs installed, search returns N results
function mockSearchSuccess(resultJson: string): void {
  let callIndex = 0;
  spawnSpy.mockImplementation(
    // biome-ignore lint/suspicious/noExplicitAny: Bun.spawn overloads don't unify with mockImplementation
    ((..._args: any[]) => {
      const responses = [
        { exitCode: 0, stdout: "Python 3.12.0\n" }, // python3 --version
        { exitCode: 0, stdout: "" }, // import ddgs
        { exitCode: 0, stdout: resultJson }, // search script
      ];
      const r = responses[callIndex++] ?? { exitCode: 0, stdout: "" };
      return makeSpawnResult(r.exitCode, r.stdout);
    }) as unknown as typeof Bun.spawn,
  );
}

describe("createWebSearchTool", () => {
  const searchConfig = { provider: "duckduckgo" };

  describe("returns JSON array of results", () => {
    it("returns a JSON string of results from the provider", async () => {
      mockSearchSuccess(buildResults(5));

      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "hello world" });

      const parsed = JSON.parse(output) as Array<{ title: string; url: string; snippet: string }>;
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(5);
      expect(parsed[0]).toHaveProperty("title");
      expect(parsed[0]).toHaveProperty("url");
      expect(parsed[0]).toHaveProperty("snippet");
    });
  });

  describe("empty query handling", () => {
    it("returns error string when query is empty string", async () => {
      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "" });

      expect(output).toContain("Error");
    });

    it("returns error string when query is whitespace only", async () => {
      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "   " });

      expect(output).toContain("Error");
    });
  });

  describe("max_results clamping", () => {
    it("clamps max_results to 20 when a larger value is provided", async () => {
      mockSearchSuccess(buildResults(20));

      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "test", max_results: 50 });

      const parsed = JSON.parse(output) as Array<unknown>;
      expect(parsed.length).toBeLessThanOrEqual(20);
    });

    it("clamps max_results to at least 1 when 0 is provided", async () => {
      mockSearchSuccess(buildResults(1));

      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "test", max_results: 0 });

      const parsed = JSON.parse(output) as Array<unknown>;
      expect(parsed.length).toBeGreaterThanOrEqual(1);
    });

    it("uses default of 5 when max_results is omitted", async () => {
      mockSearchSuccess(buildResults(5));

      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "test" });

      const parsed = JSON.parse(output) as Array<unknown>;
      expect(parsed.length).toBe(5);
    });
  });

  describe("ddgs auto-install notice", () => {
    it("prefixes output with Notice: when ddgs was auto-installed", async () => {
      let callIndex = 0;
      spawnSpy.mockImplementation(
        // biome-ignore lint/suspicious/noExplicitAny: Bun.spawn overloads don't unify with mockImplementation
        ((..._args: any[]) => {
          const responses = [
            { exitCode: 0, stdout: "Python 3.12.0\n" }, // python3 --version
            { exitCode: 1, stdout: "", stderr: "No module named ddgs" }, // import ddgs fails
            { exitCode: 0, stdout: "" }, // pip install ddgs
            { exitCode: 0, stdout: buildResults(2) }, // search
          ];
          const r = responses[callIndex++] ?? { exitCode: 0, stdout: "" };
          return makeSpawnResult(r.exitCode, r.stdout, r.stderr ?? "");
        }) as unknown as typeof Bun.spawn,
      );

      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "test" });

      expect(output).toContain("Notice:");
      expect(output).toContain("ddgs");
      // JSON results follow the notice line
      const jsonPart = output.slice(output.indexOf("["));
      const parsed = JSON.parse(jsonPart) as Array<unknown>;
      expect(parsed.length).toBe(2);
    });
  });

  describe("Python not available", () => {
    it("returns Error string when Python is not on PATH", async () => {
      spawnSpy.mockImplementation(
        // biome-ignore lint/suspicious/noExplicitAny: overload union incompatible with mockImplementation signature
        ((..._args: any[]) => {
          throw new Error("spawn ENOENT");
        }) as unknown as typeof Bun.spawn,
      );

      const tool = createWebSearchTool(searchConfig);
      const output = await tool.execute({ query: "test" });

      expect(output).toContain("Error");
      expect(output).toContain("Python");
    });
  });
});
