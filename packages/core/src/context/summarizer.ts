import type Anthropic from "@anthropic-ai/sdk";
import { APIConnectionError, InternalServerError, RateLimitError } from "@anthropic-ai/sdk";
import { toMessageParams } from "./adapter.js";
import type { ChatMessage } from "./types.js";

export interface SummaryBuildInput {
  messages: ChatMessage[];
  summarizeIndices: number[];
  wordLimit: number;
  priorSummary?: string;
}

function headTail(s: string, limit: number): string {
  if (s.length <= limit) return s;
  const half = Math.floor(limit / 2);
  return `${s.slice(0, half)}...(${s.length - limit} chars omitted)...${s.slice(-half)}`;
}

function flattenMessages(messages: ChatMessage[]): string {
  const TEXT_LIMIT = 800;
  const TOOL_LIMIT = 2_400;
  const parts: string[] = [];

  for (const msg of messages) {
    const role = msg.role.toUpperCase();
    for (const block of msg.content) {
      if (block.type === "text") {
        parts.push(`${role}: ${headTail(block.text, TEXT_LIMIT)}`);
      } else if (block.type === "tool_use") {
        parts.push(`ASSISTANT TOOL USE ${block.name}: ${JSON.stringify(block.input)}`);
      } else if (block.type === "tool_result") {
        parts.push(`TOOL RESULT ${block.toolUseId}: ${headTail(block.content, TOOL_LIMIT)}`);
      }
    }
  }

  return parts.join("\n\n");
}

function summaryInstruction(wordLimit: number): string {
  return [
    "Summarize the conversation above.",
    "Preserve: exact file paths, commands run, errors seen, key decisions, and any open tasks.",
    "Tool outputs may be abbreviated if repetitive.",
    `Keep under ${wordLimit} words.`,
  ].join(" ");
}

export function buildSummaryRequest(input: SummaryBuildInput): ChatMessage[] {
  const toSummarize = input.summarizeIndices
    .map((i) => input.messages[i])
    .filter((m): m is ChatMessage => m !== undefined);

  const flattened = headTail(flattenMessages(toSummarize), 24_000);
  const prior = input.priorSummary
    ? `[Prior summary:\n${input.priorSummary.trim()}]\n\n---\n\n`
    : "";
  const body = prior + (flattened || "");
  const text = body
    ? `${body}\n\n${summaryInstruction(input.wordLimit)}`
    : summaryInstruction(input.wordLimit);

  return [{ role: "user", content: [{ type: "text", text }] }];
}

function isRetryable(err: unknown): boolean {
  return (
    err instanceof RateLimitError ||
    err instanceof InternalServerError ||
    err instanceof APIConnectionError
  );
}

export async function summarizeWithRetry(
  client: Anthropic,
  fastModel: string,
  messages: ChatMessage[],
  maxTokens = 1024,
  maxRetries = 3,
  retryBaseMs = 1_000,
): Promise<string> {
  const params = toMessageParams(messages);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: fastModel,
        max_tokens: maxTokens,
        messages: params,
      });
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text")
        throw new Error("No text block in summary response");
      return textBlock.text;
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === maxRetries) break;
      await Bun.sleep(retryBaseMs * 2 ** attempt);
    }
  }

  throw lastError;
}
