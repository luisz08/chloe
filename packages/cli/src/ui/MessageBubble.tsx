import { Box, Text } from "ink";
import type { ChatMessage } from "./types.js";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming: boolean;
}

function roleLabel(role: ChatMessage["role"]): string {
  switch (role) {
    case "user":
      return "You";
    case "assistant":
      return "Chloe";
    case "tool":
      return "Tool";
  }
}

function roleColor(role: ChatMessage["role"]): string {
  switch (role) {
    case "user":
      return "cyan";
    case "assistant":
      return "green";
    case "tool":
      return "yellow";
  }
}

function renderContent(message: ChatMessage, isStreaming: boolean): string {
  if (message.role === "tool") {
    const parts: string[] = [];
    if (message.toolName !== undefined) {
      parts.push(`▶ ${message.toolName}`);
    }
    if (message.toolInput !== undefined) {
      parts.push(JSON.stringify(message.toolInput, null, 2));
    }
    if (message.toolOutput !== undefined) {
      parts.push(
        `→ ${message.toolOutput.slice(0, 500)}${message.toolOutput.length > 500 ? "…" : ""}`,
      );
    }
    return parts.join("\n");
  }

  const content = message.content;

  if (message.role === "assistant" && !isStreaming && content.length > 0) {
    // Markdown rendering — use Bun.markdown.ansi() when available
    if (
      typeof Bun !== "undefined" &&
      typeof (Bun as Record<string, unknown>).markdown === "object"
    ) {
      try {
        const md = (
          Bun as { markdown: { ansi: (s: string, opts?: Record<string, unknown>) => string } }
        ).markdown;
        return md.ansi(content, {
          colors: true,
          columns: process.stdout.columns ?? 80,
        });
      } catch {
        // fall through to plain text
      }
    }
  }

  return content;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const content = renderContent(message, isStreaming);
  const cursor = isStreaming && message.role === "assistant" ? "▍" : "";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={roleColor(message.role)} bold>
        {roleLabel(message.role)}
      </Text>
      <Box paddingLeft={2}>
        <Text>
          {content}
          {cursor}
        </Text>
      </Box>
    </Box>
  );
}
