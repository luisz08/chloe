import type { ContentBlockParam, MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { CBlock, ChatMessage } from "./types.js";

function blockToC(block: ContentBlockParam): CBlock | null {
  if (block.type === "text") {
    return { type: "text", text: block.text };
  }
  if (block.type === "tool_use") {
    return { type: "tool_use", id: block.id, name: block.name, input: block.input };
  }
  if (block.type === "tool_result") {
    const raw = block.content;
    let content: string;
    if (typeof raw === "string") {
      content = raw;
    } else if (Array.isArray(raw)) {
      content = raw
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    } else {
      content = "";
    }
    return { type: "tool_result", toolUseId: block.tool_use_id, content };
  }
  return null;
}

export function toChatMessages(params: MessageParam[]): ChatMessage[] {
  return params.map((p) => {
    const content: CBlock[] =
      typeof p.content === "string"
        ? [{ type: "text", text: p.content }]
        : (p.content as ContentBlockParam[]).map(blockToC).filter((b): b is CBlock => b !== null);
    return { role: p.role as ChatMessage["role"], content };
  });
}

export function toMessageParams(messages: ChatMessage[]): MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((b): ContentBlockParam => {
      if (b.type === "text") return { type: "text", text: b.text };
      if (b.type === "tool_use")
        return {
          type: "tool_use",
          id: b.id,
          name: b.name,
          input: b.input as Record<string, unknown>,
        };
      return { type: "tool_result", tool_use_id: b.toolUseId, content: b.content };
    }),
  }));
}
