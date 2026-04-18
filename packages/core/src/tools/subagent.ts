/**
 * Subagent tools for delegating work to specialized models.
 *
 * Three subagent tools:
 * - vision_analyze: Analyze images using vision-capable model
 * - fast_query: Quick responses using fast model
 * - deep_reasoning: Complex analysis using reasoning model
 *
 * Each subagent makes a single API call and returns text result.
 * When ToolContext is provided, creates child session and persists request/response.
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
import type { SubagentRequestContent, SubagentResponseContent } from "../session/types.js";
import type { ToolRegistry } from "./registry.js";
import type { Tool, ToolContext } from "./types.js";

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

// ─── Helper: Persist Subagent Call ────────────────────────────────────────────────

async function persistSubagentCall(
  context: ToolContext,
  subagentType: "vision_analyze" | "fast_query" | "deep_reasoning",
  requestContent: SubagentRequestContent,
  responseText: string,
  response: Anthropic.Messages.Message,
  elapsedMs: number,
): Promise<void> {
  const { storage, sessionId } = context;

  // Generate title from prompt preview
  const promptPreview = requestContent.prompt.slice(0, 50);
  const title = `${subagentType}: ${promptPreview}`;

  // Create child session
  const childSession = await storage.createChildSession(sessionId, subagentType, title);

  // Persist request as user message
  await storage.appendMessage(childSession.id, "user", requestContent);

  // Build response content with metadata
  const responseContent: SubagentResponseContent = {
    type: "subagent_response",
    text: responseText,
    metadata: {
      api_message_id: response.id,
      model: response.model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      stop_reason: response.stop_reason ?? "end_turn",
      elapsed_ms: elapsedMs,
    },
  };

  // Persist response as assistant message
  await storage.appendMessage(childSession.id, "assistant", responseContent);

  log.debug("subagent session persisted", {
    childSession: childSession.id,
    parentSession: sessionId,
    type: subagentType,
  });
}

async function persistSubagentError(
  context: ToolContext,
  subagentType: "vision_analyze" | "fast_query" | "deep_reasoning",
  requestContent: SubagentRequestContent,
  errorMessage: string,
): Promise<void> {
  const { storage, sessionId } = context;

  const promptPreview = requestContent.prompt.slice(0, 50);
  const title = `${subagentType}: ${promptPreview}`;

  const childSession = await storage.createChildSession(sessionId, subagentType, title);
  await storage.appendMessage(childSession.id, "user", requestContent);

  const responseContent: SubagentResponseContent = {
    type: "subagent_response",
    text: "",
    metadata: {
      api_message_id: "",
      model: "",
      input_tokens: 0,
      output_tokens: 0,
      stop_reason: "error",
      elapsed_ms: 0,
    },
    error: errorMessage,
  };

  await storage.appendMessage(childSession.id, "assistant", responseContent);

  log.debug("subagent error session persisted", {
    childSession: childSession.id,
    parentSession: sessionId,
    type: subagentType,
    error: errorMessage,
  });
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
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      const args = input as { path?: string; url?: string; prompt: string };
      const { prompt } = args;

      // Build message content
      const content: ContentBlockParam[] = [];

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

      content.push({ type: "text", text: prompt });

      if (content.length === 1 && content[0]?.type === "text") {
        return "Error: No image provided. Please specify either 'path' or 'url' parameter.";
      }

      log.debug("vision_analyze request", {
        model: modelConfig.visionModel,
        hasImage: content.some((c) => c.type === "image"),
      });

      // Build request content for persistence
      const requestContent: SubagentRequestContent = {
        type: "subagent_request",
        prompt,
      };
      if (args.path !== undefined) {
        requestContent.imagePath = args.path;
      }
      if (args.url !== undefined) {
        requestContent.imageUrl = args.url;
      }

      const startMs = Date.now();

      // Recursion prevention: check if already being called
      if (registry.getCallingTool() === "vision_analyze") {
        return "Error: vision_analyze cannot call itself recursively";
      }

      registry.setCallingTool("vision_analyze");

      try {
        const response = await client.messages.create({
          model: modelConfig.visionModel,
          max_tokens: 4096,
          messages: [{ role: "user", content }],
        });

        registry.setCallingTool(null);

        const elapsedMs = Date.now() - startMs;

        const textBlocks = response.content.filter((block) => block.type === "text");
        const result = textBlocks.map((b) => b.text).join("\n");

        log.debug("vision_analyze response", {
          tokens: response.usage.output_tokens,
          textLength: result.length,
        });

        // Persist if context available
        if (context !== undefined) {
          await persistSubagentCall(
            context,
            "vision_analyze",
            requestContent,
            result,
            response,
            elapsedMs,
          );
        }

        return result;
      } catch (err) {
        registry.setCallingTool(null);
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("vision_analyze error", { error: errorMessage });

        if (context !== undefined) {
          await persistSubagentError(context, "vision_analyze", requestContent, errorMessage);
        }

        return `Error: ${errorMessage}`;
      }
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
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      const args = input as { query: string };

      log.debug("fast_query request", { model: modelConfig.fastModel });

      const requestContent: SubagentRequestContent = {
        type: "subagent_request",
        prompt: args.query,
      };

      const startMs = Date.now();

      // Recursion prevention: check if already being called
      if (registry.getCallingTool() === "fast_query") {
        return "Error: fast_query cannot call itself recursively";
      }

      registry.setCallingTool("fast_query");

      try {
        const response = await client.messages.create({
          model: modelConfig.fastModel,
          max_tokens: 2048,
          messages: [{ role: "user", content: args.query }],
        });

        registry.setCallingTool(null);

        const elapsedMs = Date.now() - startMs;

        const textBlocks = response.content.filter((block) => block.type === "text");
        const result = textBlocks.map((b) => b.text).join("\n");

        log.debug("fast_query response", {
          tokens: response.usage.output_tokens,
          textLength: result.length,
        });

        if (context !== undefined) {
          await persistSubagentCall(
            context,
            "fast_query",
            requestContent,
            result,
            response,
            elapsedMs,
          );
        }

        return result;
      } catch (err) {
        registry.setCallingTool(null);
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("fast_query error", { error: errorMessage });

        if (context !== undefined) {
          await persistSubagentError(context, "fast_query", requestContent, errorMessage);
        }

        return `Error: ${errorMessage}`;
      }
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
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      const args = input as { problem: string; context?: string };

      const messageContent: MessageParam["content"] = args.context
        ? `Context:\n${args.context}\n\nProblem:\n${args.problem}`
        : args.problem;

      log.debug("deep_reasoning request", { model: modelConfig.reasoningModel });

      const requestContent: SubagentRequestContent = {
        type: "subagent_request",
        prompt: args.problem,
      };
      if (args.context !== undefined) {
        requestContent.context = args.context;
      }

      const startMs = Date.now();

      // Recursion prevention: check if already being called
      if (registry.getCallingTool() === "deep_reasoning") {
        return "Error: deep_reasoning cannot call itself recursively";
      }

      registry.setCallingTool("deep_reasoning");

      try {
        const response = await client.messages.create({
          model: modelConfig.reasoningModel,
          max_tokens: 8192,
          messages: [{ role: "user", content: messageContent }],
        });

        registry.setCallingTool(null);

        const elapsedMs = Date.now() - startMs;

        const textBlocks = response.content.filter((block) => block.type === "text");
        const result = textBlocks.map((b) => b.text).join("\n");

        log.debug("deep_reasoning response", {
          tokens: response.usage.output_tokens,
          textLength: result.length,
        });

        if (context !== undefined) {
          await persistSubagentCall(
            context,
            "deep_reasoning",
            requestContent,
            result,
            response,
            elapsedMs,
          );
        }

        return result;
      } catch (err) {
        registry.setCallingTool(null);
        const errorMessage = err instanceof Error ? err.message : String(err);
        log.error("deep_reasoning error", { error: errorMessage });

        if (context !== undefined) {
          await persistSubagentError(context, "deep_reasoning", requestContent, errorMessage);
        }

        return `Error: ${errorMessage}`;
      }
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
