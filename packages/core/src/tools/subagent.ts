/**
 * Subagent tools for delegating work to specialized models.
 *
 * Three subagent tools:
 * - vision_analyze: Analyze images using vision-capable model
 * - fast_query: Quick responses using fast model
 * - deep_reasoning: Complex analysis using reasoning model
 *
 * Each subagent makes a single API call and returns text result.
 * Recursion prevention: subagents cannot call themselves.
 */

import { existsSync, readFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  ImageBlockParam,
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages";
import type { ResolvedModelConfig } from "../agent/types.js";
import { getLogger } from "../logger/index.js";
import type { ToolRegistry } from "./registry.js";
import type { Tool } from "./types.js";

const log = getLogger("subagent");

// ─── Media Type Mapping ────────────────────────────────────────────────────────

type SupportedMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

const MEDIA_TYPE_MAP: Record<string, SupportedMediaType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/png",
};

function getMediaType(path: string): SupportedMediaType {
  const ext = path.toLowerCase().slice(path.lastIndexOf("."));
  return MEDIA_TYPE_MAP[ext] ?? "image/png";
}

function buildImageBlock(
  source: { type: "path"; value: string } | { type: "url"; value: string },
): ImageBlockParam | null {
  try {
    if (source.type === "path") {
      if (!existsSync(source.value)) {
        log.warn("image path does not exist", { path: source.value });
        return null;
      }
      const mediaType = getMediaType(source.value);
      const data = readFileSync(source.value).toString("base64");
      return {
        type: "image",
        source: { type: "base64", media_type: mediaType, data },
      };
    }
    // URL image - no media_type needed, Anthropic fetches and determines
    return {
      type: "image",
      source: { type: "url", url: source.value },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("failed to build image block", { source: source.value, error: message });
    return null;
  }
}

// ─── Vision Analyze Tool ────────────────────────────────────────────────────────

export function createVisionAnalyzeTool(
  client: Anthropic,
  modelConfig: ResolvedModelConfig,
  registry: ToolRegistry,
): Tool {
  return {
    name: "vision_analyze",
    description:
      "Analyze image content using a vision-capable model. Use this when you need to understand image content, describe visual elements, or extract information from images. Provide either a local file path or URL, plus a prompt describing what to analyze.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Local image file path (e.g., ./image.png, /path/to/image.jpg)",
        },
        url: {
          type: "string",
          description: "Image URL (e.g., https://example.com/image.png)",
        },
        prompt: {
          type: "string",
          description:
            "What to analyze in the image (e.g., 'Describe the content', 'Extract text from the image')",
        },
      },
      required: ["prompt"],
    },
    async execute(input: unknown): Promise<string> {
      // Check recursion prevention
      if (registry.getCallingTool() === "vision_analyze") {
        return "Error: vision_analyze cannot call itself recursively";
      }

      const args = input as { path?: string; url?: string; prompt: string };
      const { prompt } = args;

      // Build message content
      const content: ContentBlockParam[] = [];

      // Add image if provided
      if (args.path) {
        const imageBlock = buildImageBlock({ type: "path", value: args.path });
        if (imageBlock !== null) {
          content.push(imageBlock);
        }
      } else if (args.url) {
        const imageBlock = buildImageBlock({ type: "url", value: args.url });
        if (imageBlock !== null) {
          content.push(imageBlock);
        }
      }

      // Add text prompt
      content.push({ type: "text", text: prompt });

      if (content.length === 1 && content[0]?.type === "text") {
        // No image provided - return error
        return "Error: No image provided. Please specify either 'path' or 'url' parameter.";
      }

      log.debug("vision_analyze request", {
        model: modelConfig.visionModel,
        hasImage: content.some((c) => c.type === "image"),
      });

      // Call vision model
      const response = await client.messages.create({
        model: modelConfig.visionModel,
        max_tokens: 4096,
        messages: [{ role: "user", content }],
      });

      // Extract text from response
      const textBlocks = response.content.filter((block) => block.type === "text");
      const result = textBlocks.map((b) => b.text).join("\n");

      log.debug("vision_analyze response", {
        tokens: response.usage.output_tokens,
        textLength: result.length,
      });

      return result;
    },
  };
}

// ─── Fast Query Tool ────────────────────────────────────────────────────────────

export function createFastQueryTool(
  client: Anthropic,
  modelConfig: ResolvedModelConfig,
  registry: ToolRegistry,
): Tool {
  return {
    name: "fast_query",
    description:
      "Get quick responses using a fast model. Use this for simple questions, quick lookups, or tasks that need minimal processing. Faster but less detailed than the main model.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The question or request to process",
        },
      },
      required: ["query"],
    },
    async execute(input: unknown): Promise<string> {
      // Check recursion prevention
      if (registry.getCallingTool() === "fast_query") {
        return "Error: fast_query cannot call itself recursively";
      }

      const args = input as { query: string };

      log.debug("fast_query request", { model: modelConfig.fastModel });

      // Call fast model
      const response = await client.messages.create({
        model: modelConfig.fastModel,
        max_tokens: 2048,
        messages: [{ role: "user", content: args.query }],
      });

      // Extract text from response
      const textBlocks = response.content.filter((block) => block.type === "text");
      const result = textBlocks.map((b) => b.text).join("\n");

      log.debug("fast_query response", {
        tokens: response.usage.output_tokens,
        textLength: result.length,
      });

      return result;
    },
  };
}

// ─── Deep Reasoning Tool ────────────────────────────────────────────────────────

export function createDeepReasoningTool(
  client: Anthropic,
  modelConfig: ResolvedModelConfig,
  registry: ToolRegistry,
): Tool {
  return {
    name: "deep_reasoning",
    description:
      "Perform complex analysis using a reasoning model. Use this for multi-step reasoning, difficult problems, complex analysis, or tasks requiring deep thought. More thorough but slower.",
    inputSchema: {
      type: "object",
      properties: {
        problem: {
          type: "string",
          description: "The problem or question requiring deep reasoning",
        },
        context: {
          type: "string",
          description: "Optional additional context to help with reasoning",
        },
      },
      required: ["problem"],
    },
    async execute(input: unknown): Promise<string> {
      // Check recursion prevention
      if (registry.getCallingTool() === "deep_reasoning") {
        return "Error: deep_reasoning cannot call itself recursively";
      }

      const args = input as { problem: string; context?: string };

      // Build message content
      const content: MessageParam["content"] = args.context
        ? `Context:\n${args.context}\n\nProblem:\n${args.problem}`
        : args.problem;

      log.debug("deep_reasoning request", { model: modelConfig.reasoningModel });

      // Call reasoning model
      const response = await client.messages.create({
        model: modelConfig.reasoningModel,
        max_tokens: 8192,
        messages: [{ role: "user", content }],
      });

      // Extract text from response
      const textBlocks = response.content.filter((block) => block.type === "text");
      const result = textBlocks.map((b) => b.text).join("\n");

      log.debug("deep_reasoning response", {
        tokens: response.usage.output_tokens,
        textLength: result.length,
      });

      return result;
    },
  };
}

// ─── Factory Function ───────────────────────────────────────────────────────────

/**
 * Create all subagent tools.
 */
export function createSubagentTools(
  client: Anthropic,
  modelConfig: ResolvedModelConfig,
  registry: ToolRegistry,
): Tool[] {
  return [
    createVisionAnalyzeTool(client, modelConfig, registry),
    createFastQueryTool(client, modelConfig, registry),
    createDeepReasoningTool(client, modelConfig, registry),
  ];
}
