export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  parentId: string | null;
  subagentType: string | null;
}

export interface SessionSummary extends Session {
  messageCount: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: unknown;
  createdAt: number;
}

export interface SubagentRequestContent {
  type: "subagent_request";
  prompt: string;
  imagePath?: string;
  imageUrl?: string;
  context?: string;
}

export interface SubagentResponseContent {
  type: "subagent_response";
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
    (content as Record<string, unknown>).type === "subagent_request"
  );
}

export function isSubagentResponseContent(content: unknown): content is SubagentResponseContent {
  return (
    typeof content === "object" &&
    content !== null &&
    (content as Record<string, unknown>).type === "subagent_response"
  );
}
