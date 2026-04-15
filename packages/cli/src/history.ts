import type { Message } from "@chloe/core";
import type { ChatMessage } from "./ui/types.js";

const HISTORY_LIMIT = 50;

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

function isTextBlock(b: unknown): b is { type: "text"; text: string } {
  return typeof b === "object" && b !== null && (b as { type: string }).type === "text";
}

function isToolUseBlock(
  b: unknown,
): b is { type: "tool_use"; id: string; name: string; input: unknown } {
  return typeof b === "object" && b !== null && (b as { type: string }).type === "tool_use";
}

function isToolResultBlock(
  b: unknown,
): b is { type: "tool_result"; tool_use_id: string; content: string } {
  return typeof b === "object" && b !== null && (b as { type: string }).type === "tool_result";
}

export function convertStoredMessages(messages: Message[]): ChatMessage[] {
  const slice = messages.slice(-HISTORY_LIMIT);
  const result: ChatMessage[] = [];
  const toolUseIndex = new Map<string, number>();

  for (const storedMsg of slice) {
    if (storedMsg.role === "user") {
      if (typeof storedMsg.content === "string") {
        result.push({ id: makeId(), role: "user", content: storedMsg.content, state: "complete" });
        continue;
      }
      if (Array.isArray(storedMsg.content)) {
        for (const block of storedMsg.content) {
          if (isToolResultBlock(block)) {
            const idx = toolUseIndex.get(block.tool_use_id);
            if (idx !== undefined) {
              const existing = result[idx];
              if (existing) {
                result[idx] = { ...existing, toolOutput: block.content, state: "done" };
              }
            }
          }
        }
      }
    } else if (storedMsg.role === "assistant") {
      if (!Array.isArray(storedMsg.content)) continue;
      const textParts: string[] = [];
      for (const block of storedMsg.content) {
        if (isTextBlock(block)) {
          textParts.push(block.text);
        } else if (isToolUseBlock(block)) {
          const toolMsg: ChatMessage = {
            id: makeId(),
            role: "tool",
            content: "",
            toolName: block.name,
            toolInput: block.input,
            state: "done",
          };
          toolUseIndex.set(block.id, result.length);
          result.push(toolMsg);
        }
      }
      if (textParts.length > 0) {
        result.push({
          id: makeId(),
          role: "assistant",
          content: textParts.join(""),
          state: "complete",
        });
      }
    }
  }

  return result;
}
