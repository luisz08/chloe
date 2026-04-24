export const MessageRole = {
  User: "user",
  Assistant: "assistant",
  Tool: "tool",
} as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

export const SubagentContentType = {
  Request: "subagent_request",
  Response: "subagent_response",
} as const;
export type SubagentContentType = (typeof SubagentContentType)[keyof typeof SubagentContentType];

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  parentId: string | null;
  subagentType: string | null;
  summary: string | null;
}

export interface SessionSummary extends Session {
  messageCount: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: unknown;
  createdAt: number;
}

export interface SubagentRequestContent {
  type: typeof SubagentContentType.Request;
  prompt: string;
  imagePath?: string;
  imageUrl?: string;
  context?: string;
}

export interface SubagentResponseContent {
  type: typeof SubagentContentType.Response;
  text: string;
  metadata: {
    api_message_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    stop_reason: string;
    elapsed_ms: number;
  };
  error?: string;
}

export interface SessionTree {
  session: Session;
  messages: Message[];
  children: SessionTree[];
}

export function isSubagentRequestContent(content: unknown): content is SubagentRequestContent {
  return (
    typeof content === "object" &&
    content !== null &&
    (content as Record<string, unknown>).type === SubagentContentType.Request
  );
}

export function isSubagentResponseContent(content: unknown): content is SubagentResponseContent {
  return (
    typeof content === "object" &&
    content !== null &&
    (content as Record<string, unknown>).type === SubagentContentType.Response
  );
}
