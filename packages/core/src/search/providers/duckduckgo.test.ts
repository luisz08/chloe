import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { DuckDuckGoProvider } from "./duckduckgo.js";

// Helper to build a fake Bun.spawn result
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

type SpawnCall = Parameters<typeof Bun.spawn>;

let spawnSpy: ReturnType<typeof spyOn<typeof Bun, "spawn">>;

beforeEach(() => {
  spawnSpy = spyOn(Bun, "spawn");
});

afterEach(() => {
  spawnSpy.mockRestore();
});

function mockSpawnSequence(
  responses: Array<{ exitCode: number; stdout: string; stderr?: string }>,
) {
  let callIndex = 0;
  spawnSpy.mockImplementation(
    // biome-ignore lint/suspicious/noExplicitAny: Bun.spawn overloads don't unify with mockImplementation
    ((..._args: any[]) => {
      const r = responses[callIndex++] ?? { exitCode: 0, stdout: "", stderr: "" };
      return makeSpawnResult(r.exitCode, r.stdout, r.stderr ?? "");
    }) as unknown as typeof Bun.spawn,
  );
}

const SEARCH_RESULTS = JSON.stringify([
  { title: "Result 1", url: "https://example.com/1", snippet: "Snippet 1" },
  { title: "Result 2", url: "https://example.com/2", snippet: "Snippet 2" },
]);

describe("DuckDuckGoProvider", () => {
  describe("successful search", () => {
    it("returns parsed SearchResult[] from Python subprocess stdout", async () => {
      mockSpawnSequence([
        { exitCode: 0, stdout: "Python 3.12.0\n" }, // python3 --version
        { exitCode: 0, stdout: "" }, // import ddgs check
        { exitCode: 0, stdout: SEARCH_RESULTS }, // search script
      ]);

      const provider = new DuckDuckGoProvider();
      const results = await provider.search("test query");

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: "Result 1",
        url: "https://example.com/1",
        snippet: "Snippet 1",
      });
    });

    it("passes maxResults to the Python script", async () => {
      mockSpawnSequence([
        { exitCode: 0, stdout: "Python 3.11.0\n" },
        { exitCode: 0, stdout: "" },
        {
          exitCode: 0,
          stdout: JSON.stringify([{ title: "R", url: "https://x.com", snippet: "s" }]),
        },
      ]);

      const provider = new DuckDuckGoProvider();
      await provider.search("test", { maxResults: 3 });

      // Third spawn call is the search script — verify max_results=3 in the command
      const calls = spawnSpy.mock.calls as Array<SpawnCall>;
      // biome-ignore lint/style/noNonNullAssertion: call count asserted by mock sequence
      const scriptCmd = calls[2]![0] as string[];
      expect(scriptCmd[2]).toContain("max_results=3");
    });

    it("clamps maxResults to 20", async () => {
      mockSpawnSequence([
        { exitCode: 0, stdout: "Python 3.10.0\n" },
        { exitCode: 0, stdout: "" },
        { exitCode: 0, stdout: "[]" },
      ]);

      const provider = new DuckDuckGoProvider();
      await provider.search("test", { maxResults: 50 });

      const calls = spawnSpy.mock.calls as Array<SpawnCall>;
      // biome-ignore lint/style/noNonNullAssertion: call count asserted by mock sequence
      const scriptCmd = calls[2]![0] as string[];
      expect(scriptCmd[2]).toContain("max_results=20");
    });
  });

  describe("Python not found", () => {
    it("throws when neither python3 nor python is on PATH", async () => {
      spawnSpy.mockImplementation(
        // biome-ignore lint/suspicious/noExplicitAny: Bun.spawn overloads don't unify with mockImplementation
        ((..._args: any[]) => {
          throw new Error("spawn ENOENT");
        }) as unknown as typeof Bun.spawn,
      );

      const provider = new DuckDuckGoProvider();
      await expect(provider.search("test")).rejects.toThrow("Python 3.8+");
    });

    it("throws when Python version is below 3.8", async () => {
      mockSpawnSequence([
        { exitCode: 0, stdout: "Python 3.6.9\n" }, // python3 too old
        { exitCode: 1, stdout: "", stderr: "not found" }, // python fallback fails
      ]);

      const provider = new DuckDuckGoProvider();
      await expect(provider.search("test")).rejects.toThrow("Python 3.8+");
    });
  });

  describe("ddgs auto-install", () => {
    it("installs ddgs when import check fails, calls notify, then searches", async () => {
      mockSpawnSequence([
        { exitCode: 0, stdout: "Python 3.12.0\n" }, // python3 --version
        { exitCode: 1, stdout: "", stderr: "No module named ddgs" }, // import ddgs fails
        { exitCode: 0, stdout: "" }, // pip install ddgs
        { exitCode: 0, stdout: SEARCH_RESULTS }, // search
      ]);

      const provider = new DuckDuckGoProvider();
      const notified: string[] = [];
      const results = await provider.search("test", { notify: (msg) => notified.push(msg) });

      expect(notified).toHaveLength(1);
      expect(notified[0]).toContain("Installing");
      expect(results).toHaveLength(2);
    });

    it("throws when pip install fails", async () => {
      mockSpawnSequence([
        { exitCode: 0, stdout: "Python 3.12.0\n" },
        { exitCode: 1, stdout: "" }, // import ddgs fails
        { exitCode: 1, stdout: "", stderr: "pip error" }, // pip install fails
      ]);

      const provider = new DuckDuckGoProvider();
      await expect(provider.search("test")).rejects.toThrow("pip install ddgs");
    });
  });

  describe("dependency caching", () => {
    it("only checks python and ddgs once across multiple search calls", async () => {
      mockSpawnSequence([
        { exitCode: 0, stdout: "Python 3.12.0\n" }, // python3 --version (once)
        { exitCode: 0, stdout: "" }, // import ddgs (once)
        { exitCode: 0, stdout: SEARCH_RESULTS }, // first search
        { exitCode: 0, stdout: SEARCH_RESULTS }, // second search
      ]);

      const provider = new DuckDuckGoProvider();
      await provider.search("first");
      await provider.search("second");

      // 4 total spawn calls: version + import + search + search
      expect(spawnSpy.mock.calls).toHaveLength(4);
    });
  });

  describe("subprocess error", () => {
    it("throws when search script exits non-zero", async () => {
      mockSpawnSequence([
        { exitCode: 0, stdout: "Python 3.12.0\n" },
        { exitCode: 0, stdout: "" },
        { exitCode: 1, stdout: "", stderr: "ConnectionError: timeout" },
      ]);

      const provider = new DuckDuckGoProvider();
      await expect(provider.search("test")).rejects.toThrow("ConnectionError");
    });
  });
});
