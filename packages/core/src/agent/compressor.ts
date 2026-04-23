import type Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
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

  const countResult = await client.messages.countTokens({
    model,
    messages,
    ...(system !== undefined ? { system } : {}),
  });

  const contextLimit = getContextLimit(model);
  if (countResult.input_tokens < contextLimit * threshold) return null;

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

  const firstBlock = summaryResponse.content[0];
  if (firstBlock === undefined || firstBlock.type !== "text") {
    throw new Error("Summarization response was not text");
  }
  const summaryText = firstBlock.text;

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
