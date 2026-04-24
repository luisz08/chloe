import { Box, Static, Text } from "ink";
import { useRef } from "react";
import { MessageBubble } from "./MessageBubble.js";
import { ToolBlock } from "./ToolBlock.js";
import type { ChatMessage, ConfirmResult, MessageState } from "./types.js";

interface ChatViewProps {
  messages: ChatMessage[];
  streamingId: string | null;
  onToolConfirm: (result: ConfirmResult) => void;
  pendingToolId: string | null;
}

const STATIC_STATES = new Set<MessageState>(["complete", "done", "denied"]);

export function ChatView({ messages, streamingId, onToolConfirm, pendingToolId }: ChatViewProps) {
  // Accumulate static messages in the order they complete — never reorder.
  // Static renders by position (index); inserting in the middle silently drops items.
  const staticRef = useRef<ChatMessage[]>([]);
  const staticIds = useRef<Set<string>>(new Set());

  const newStatic = messages.filter(
    (m) => STATIC_STATES.has(m.state) && !staticIds.current.has(m.id),
  );
  if (newStatic.length > 0) {
    for (const msg of newStatic) staticIds.current.add(msg.id);
    staticRef.current = [...staticRef.current, ...newStatic];
  }
  const staticMessages = staticRef.current;
  const activeMessages = messages.filter((m) => !STATIC_STATES.has(m.state));

  if (messages.length === 0) {
    return (
      <Box flexDirection="column" justifyContent="center" alignItems="center">
        <Text color="gray">Start a conversation. Type a message and press Enter.</Text>
        <Text color="gray" dimColor>
          (Ctrl+J or Shift+Enter for newline)
        </Text>
      </Box>
    );
  }

  return (
    <>
      <Static items={staticMessages}>
        {(msg) => {
          if (msg.role === "tool") {
            return (
              <ToolBlock key={msg.id} message={msg} isPending={false} onConfirm={onToolConfirm} />
            );
          }
          return <MessageBubble key={msg.id} message={msg} isStreaming={false} />;
        }}
      </Static>
      <Box flexDirection="column">
        {activeMessages.map((msg) => {
          if (msg.role === "tool") {
            return (
              <ToolBlock
                key={msg.id}
                message={msg}
                isPending={msg.id === pendingToolId}
                onConfirm={onToolConfirm}
              />
            );
          }
          return <MessageBubble key={msg.id} message={msg} isStreaming={msg.id === streamingId} />;
        })}
      </Box>
    </>
  );
}
