import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { getContextLimit } from "./models.js";

export interface CompressorOptions {
  client: Anthropic;
  model: string;
  fastModel: string;
  system?: string;
  threshold: number;
  keepRecentCount: number;
}

export interface CompressResult {
  messages: MessageParam[];
  summaryText: string;
  compressedCount: number;
  keptCount: number;
}

// ~3.5 chars per token for Claude models; 4 tokens overhead per message for role/formatting.
function countTokensLocal(messages: MessageParam[], system?: string): number {
  let chars = system?.length ?? 0;
  for (const msg of messages) {
    chars += 14; // ~4 tokens of message formatting overhead
    if (typeof msg.content === "string") {
      chars += msg.content.length;
    } else {
      for (const block of msg.content as ContentBlockParam[]) {
        if (block.type === "text") {
          chars += block.text.length;
        } else if (block.type === "image") {
          chars += 3500; // ~1000 tokens for a typical image
        } else if (block.type === "tool_use") {
          chars += block.name.length + JSON.stringify(block.input).length;
        } else if (block.type === "tool_result") {
          const c = block.content;
          if (typeof c === "string") {
            chars += c.length;
          } else if (Array.isArray(c)) {
            for (const inner of c) {
              if (inner.type === "text") chars += inner.text.length;
            }
          }
        }
      }
    }
  }
  return Math.ceil(chars / 3.5);
}

async function resolveTokenCount(
  client: Anthropic,
  messages: MessageParam[],
  model: string,
  system?: string,
): Promise<number> {
  try {
    const result = await client.messages.countTokens({
      model,
      messages,
      ...(system !== undefined ? { system } : {}),
    });
    return result.input_tokens;
  } catch (err) {
    if (err instanceof Anthropic.NotFoundError) {
      return countTokensLocal(messages, system);
    }
    throw err;
  }
}

export class ContextTooLargeError extends Error {
  constructor() {
    super(
      "Session is too large to compress. Even the most recent messages exceed the context limit.",
    );
    this.name = "ContextTooLargeError";
  }
}

export async function compressIfNeeded(
  messages: MessageParam[],
  options: CompressorOptions,
): Promise<CompressResult | null> {
  const { client, model, fastModel, system, threshold, keepRecentCount } = options;

  // Fast-path: short sessions never need compression (satisfies SC-006)
  if (messages.length <= keepRecentCount) return null;

  const inputTokens = await resolveTokenCount(client, messages, model, system);
  const contextLimit = getContextLimit(model);
  if (inputTokens < contextLimit * threshold) return null;

  const toSummarize = messages.slice(0, -keepRecentCount);
  const recent = messages.slice(-keepRecentCount);

  if (toSummarize.length === 0) {
    throw new ContextTooLargeError();
  }

  const summaryResponse = await client.messages.create({
    model: fastModel,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Please summarize the following conversation history into a structured format covering:\n## Current Task\n## Completed Actions\n## Key Decisions & Facts\n## User Preferences & Constraints\n\n<history>\n${JSON.stringify(toSummarize, null, 2)}\n</history>`,
      },
    ],
  });

  const textBlock = summaryResponse.content.find((b) => b.type === "text");
  if (textBlock === undefined || textBlock.type !== "text") {
    throw new Error("Summarization response was not text");
  }
  const summaryText = textBlock.text;

  return {
    messages: [
      { role: "user", content: `<context_summary>${summaryText}</context_summary>` },
      {
        role: "assistant",
        content: "Understood. I have the context from earlier in this session.",
      },
      ...recent,
    ],
    summaryText,
    compressedCount: toSummarize.length,
    keptCount: recent.length,
  };
}
