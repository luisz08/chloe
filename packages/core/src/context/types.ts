export type CRole = "user" | "assistant";

export type CBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string };

export interface ChatMessage {
  role: CRole;
  content: CBlock[];
}
