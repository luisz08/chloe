import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { ToolContext } from "./types.js";
import { createWebFetchTool } from "./web-fetch.js";

const SIMPLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
<h1>Hello World</h1>
<p>This is a test paragraph with some content.</p>
<script>console.log("should be removed")</script>
<style>body { color: red; }</style>
<nav><a href="/">Home</a></nav>
<footer>Footer content</footer>
</body>
</html>`;

const LONG_HTML = `<!DOCTYPE html>
<html><body><p>${"a".repeat(60_000)}</p></body></html>`;

function makeContext(modelResponse?: string): ToolContext {
  const createFn = mock(() =>
    Promise.resolve({
      content: [{ type: "text", text: modelResponse ?? "Processed content" }],
    }),
  );
  return {
    sessionId: "test-session",
    storage: {} as ToolContext["storage"],
    client: {
      messages: { create: createFn },
    } as unknown as ToolContext["client"],
    modelConfig: {
      defaultModel: "claude-sonnet-4-6",
      reasoningModel: "claude-sonnet-4-6",
      fastModel: "claude-haiku-4-5-20251001",
      visionModel: "claude-sonnet-4-6",
    },
  };
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockHtmlFetch(html: string, contentType = "text/html; charset=utf-8"): void {
  global.fetch = mock(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => contentType },
      text: () => Promise.resolve(html),
    } as unknown as Response),
  ) as unknown as typeof fetch;
}

describe("createWebFetchTool", () => {
  describe("process: false — raw Markdown", () => {
    it("returns Markdown without calling the model", async () => {
      mockHtmlFetch(SIMPLE_HTML);
      const context = makeContext();

      const tool = createWebFetchTool();
      const output = await tool.execute({ url: "https://example.com", process: false }, context);

      expect(output).toContain("Hello World");
      expect(output).not.toContain("<h1>");
      expect(output).not.toContain("should be removed");
      expect(output).not.toContain("Footer content");
      const createFn = (context.client.messages as unknown as { create: ReturnType<typeof mock> })
        .create;
      expect(createFn).not.toHaveBeenCalled();
    });
  });

  describe("process: true — model processing", () => {
    it("calls fast model with default prompt when process=true and no prompt given", async () => {
      mockHtmlFetch(SIMPLE_HTML);
      const context = makeContext("Summary of the page");

      const tool = createWebFetchTool();
      const output = await tool.execute({ url: "https://example.com", process: true }, context);

      expect(output).toBe("Summary of the page");
      const createFn = (context.client.messages as unknown as { create: ReturnType<typeof mock> })
        .create;
      expect(createFn).toHaveBeenCalledTimes(1);
      const callArg = (createFn.mock.calls[0] as Array<unknown>)[0] as {
        model: string;
        messages: Array<{ content: string }>;
      };
      expect(callArg.model).toBe("claude-haiku-4-5-20251001");
      // biome-ignore lint/style/noNonNullAssertion: length known from model call
      expect(callArg.messages[0]!.content).toContain("Summarize the key information");
    });

    it("calls model with custom prompt when provided", async () => {
      mockHtmlFetch(SIMPLE_HTML);
      const context = makeContext("Custom processed output");

      const tool = createWebFetchTool();
      const output = await tool.execute(
        { url: "https://example.com", process: true, prompt: "Extract all headings." },
        context,
      );

      expect(output).toBe("Custom processed output");
      const createFn = (context.client.messages as unknown as { create: ReturnType<typeof mock> })
        .create;
      const callArg = (createFn.mock.calls[0] as Array<unknown>)[0] as {
        messages: Array<{ content: string }>;
      };
      // biome-ignore lint/style/noNonNullAssertion: length known from model call
      expect(callArg.messages[0]!.content).toContain("Extract all headings.");
    });

    it("defaults to process=true when process is omitted", async () => {
      mockHtmlFetch(SIMPLE_HTML);
      const context = makeContext("Default processed");

      const tool = createWebFetchTool();
      const output = await tool.execute({ url: "https://example.com" }, context);

      expect(output).toBe("Default processed");
      const createFn = (context.client.messages as unknown as { create: ReturnType<typeof mock> })
        .create;
      expect(createFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("context undefined — raw Markdown fallback", () => {
    it("returns raw Markdown when context is undefined", async () => {
      mockHtmlFetch(SIMPLE_HTML);

      const tool = createWebFetchTool();
      const output = await tool.execute({ url: "https://example.com" });

      expect(output).toContain("Hello World");
      expect(output).not.toContain("<h1>");
    });
  });

  describe("content truncation at 50,000 chars", () => {
    it("truncates Markdown to 50,000 characters", async () => {
      mockHtmlFetch(LONG_HTML);

      const tool = createWebFetchTool();
      const output = await tool.execute({ url: "https://example.com", process: false });

      expect(output.length).toBeLessThanOrEqual(50_000);
    });
  });

  describe("non-HTML content-type", () => {
    it("returns error for non-HTML content-type", async () => {
      mockHtmlFetch("<data>something</data>", "application/xml");

      const tool = createWebFetchTool();
      const output = await tool.execute({ url: "https://example.com", process: false });

      expect(output).toContain("Error");
      expect(output).toContain("application/xml");
    });
  });
});
