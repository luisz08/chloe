import type Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { toChatMessages, toMessageParams } from "../context/adapter.js";
import { planCompaction } from "../context/compactionPlanner.js";
import { buildSummaryRequest, summarizeWithRetry } from "../context/summarizer.js";
import { ContentBlockType } from "../providers/anthropic.js";
import { getContextLimit } from "./models.js";

export interface CompressorOptions {
  client: Anthropic;
  model: string;
  fastModel: string;
  system?: string;
  threshold: number;
  keepRecentCount: number;
  existingSummary?: string;
}

export interface CompressResult {
  messages: MessageParam[];
  summaryText: string;
  compressedCount: number;
  keptCount: number;
  workingSetPaths: string[];
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
        if (block.type === ContentBlockType.Text) {
          chars += block.text.length;
        } else if (block.type === ContentBlockType.Image) {
          chars += 3500; // ~1000 tokens for a typical image
        } else if (block.type === ContentBlockType.ToolUse) {
          chars += block.name.length + JSON.stringify(block.input).length;
        } else if (block.type === ContentBlockType.ToolResult) {
          const c = block.content;
          if (typeof c === "string") {
            chars += c.length;
          } else if (Array.isArray(c)) {
            for (const inner of c) {
              if (inner.type === ContentBlockType.Text) chars += inner.text.length;
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
  } catch {
    return countTokensLocal(messages, system);
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
  const { client, model, fastModel, system, threshold, keepRecentCount, existingSummary } = options;

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

  // Convert to neutral types for planner + summarizer
  const allChatMessages = toChatMessages(messages);
  const plan = planCompaction({
    messages: allChatMessages,
    keepRecentCount,
    maxWorkingSetPaths: 24,
  });

  // Build flattened summary request from non-recent messages
  const summaryMessages = buildSummaryRequest({
    messages: allChatMessages,
    summarizeIndices: allChatMessages.map((_, i) => i).slice(0, -keepRecentCount),
    wordLimit: 700,
    ...(existingSummary !== undefined ? { priorSummary: existingSummary } : {}),
  });

  let summaryText: string;
  try {
    summaryText = await summarizeWithRetry(client, fastModel, summaryMessages, 2048, 3);
  } catch {
    // Fallback: legacy raw-JSON summarization without retry
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
    const textBlock = summaryResponse.content.find((b) => b.type === ContentBlockType.Text);
    if (textBlock === undefined || textBlock.type !== ContentBlockType.Text) {
      throw new Error("Summarization response was not text");
    }
    summaryText = textBlock.text;
  }

  // Rebuild the recent window using the neutral adapter (preserves tool pair integrity)
  const recentChatMessages = allChatMessages.slice(-keepRecentCount);
  const recentParams = toMessageParams(recentChatMessages);

  return {
    messages: recentParams,
    summaryText,
    compressedCount: toSummarize.length,
    keptCount: recent.length,
    workingSetPaths: plan.workingSetPaths,
  };
}
