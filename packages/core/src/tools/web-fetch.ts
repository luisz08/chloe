import { parse } from "node-html-parser";
import TurndownService from "turndown";
import type { Tool, ToolContext } from "./types.js";

const MAX_CONTENT_LENGTH = 50_000;
const DEFAULT_PROMPT = "Summarize the key information from this web page content concisely.";

interface WebFetchInput {
  url: string;
  process?: boolean;
  prompt?: string;
}

function htmlToMarkdown(html: string): string {
  const root = parse(html);

  for (const tag of ["script", "style", "nav", "footer"]) {
    for (const el of root.querySelectorAll(tag)) {
      el.remove();
    }
  }

  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  return td.turndown(root.toString());
}

export function createWebFetchTool(): Tool {
  return {
    name: "web_fetch",
    description:
      "Fetch a web page and return its content as Markdown. " +
      "By default, the content is processed by the fast model to extract key information. " +
      "Set process=false to return raw Markdown without model processing.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL of the web page to fetch.",
        },
        process: {
          type: "boolean",
          description:
            "If true (default), process the content with the fast model. If false, return raw Markdown.",
        },
        prompt: {
          type: "string",
          description: `Custom prompt for model processing. Only used when process=true. Defaults to: "${DEFAULT_PROMPT}"`,
        },
      },
      required: ["url"],
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      const { url, process: shouldProcess = true, prompt } = input as WebFetchInput;

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error fetching URL: ${msg}`;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) {
        return `Error: Expected HTML content but got '${contentType}'. Only HTML pages are supported.`;
      }

      const html = await response.text();
      let markdown = htmlToMarkdown(html);

      if (markdown.length > MAX_CONTENT_LENGTH) {
        markdown = markdown.slice(0, MAX_CONTENT_LENGTH);
      }

      if (!shouldProcess || context === undefined) {
        return markdown;
      }

      const resolvedPrompt = prompt ?? DEFAULT_PROMPT;
      try {
        const result = await context.client.messages.create({
          model: context.modelConfig.fastModel,
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: `${resolvedPrompt}\n\n${markdown}`,
            },
          ],
        });

        const textBlock = result.content.find((b) => b.type === "text");
        return textBlock?.type === "text" ? textBlock.text : markdown;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error processing content: ${msg}\n\n${markdown}`;
      }
    },
  };
}
