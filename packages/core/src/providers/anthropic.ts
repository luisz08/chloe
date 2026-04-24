// These constants are dictated by the Anthropic message protocol.
// They live here rather than in agent/types.ts so callers signal
// provider-specific knowledge at the import level.

export const ContentBlockType = {
  Text: "text",
  Image: "image",
  ToolUse: "tool_use",
  ToolResult: "tool_result",
} as const;
export type ContentBlockType = (typeof ContentBlockType)[keyof typeof ContentBlockType];

export const StopReason = {
  EndTurn: "end_turn",
  ToolUse: "tool_use",
  Error: "error",
} as const;
export type StopReason = (typeof StopReason)[keyof typeof StopReason];

export const StreamEventType = {
  ContentBlockDelta: "content_block_delta",
  TextDelta: "text_delta",
} as const;
