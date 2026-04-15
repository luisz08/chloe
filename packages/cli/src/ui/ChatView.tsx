import { Box, Text, useInput, useStdout } from "ink";
import { useEffect, useRef, useState } from "react";
import { MessageBubble } from "./MessageBubble.js";
import { ToolBlock } from "./ToolBlock.js";
import type { ChatMessage, ConfirmResult } from "./types.js";

interface ChatViewProps {
  messages: ChatMessage[];
  streamingId: string | null;
  onToolConfirm: (result: ConfirmResult) => void;
  pendingToolId: string | null;
}

export function ChatView({ messages, streamingId, onToolConfirm, pendingToolId }: ChatViewProps) {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  // Reserve rows for input area (~4) and status bar (~1)
  const viewHeight = Math.max(5, rows - 6);

  const [scrollOffset, setScrollOffset] = useState(0);
  const [manualScroll, setManualScroll] = useState(false);
  const prevLenRef = useRef(messages.length);

  // Auto-scroll to bottom on new messages unless user manually scrolled
  useEffect(() => {
    if (!manualScroll && messages.length !== prevLenRef.current) {
      setScrollOffset(0);
    }
    prevLenRef.current = messages.length;
  }, [messages.length, manualScroll]);

  useInput(
    (_, key) => {
      if (key.upArrow) {
        setManualScroll(true);
        setScrollOffset((o) => Math.min(o + 1, Math.max(0, messages.length - 1)));
      } else if (key.downArrow) {
        setScrollOffset((o) => {
          const next = Math.max(0, o - 1);
          if (next === 0) setManualScroll(false);
          return next;
        });
      }
    },
    { isActive: pendingToolId === null },
  );

  if (messages.length === 0) {
    return (
      <Box height={viewHeight} flexDirection="column" justifyContent="center" alignItems="center">
        <Text color="gray">Start a conversation. Type a message and press Enter.</Text>
        <Text color="gray" dimColor>
          (Ctrl+J or Shift+Enter for newline)
        </Text>
      </Box>
    );
  }

  // Scroll: show last viewHeight-ish messages, offset upward by scrollOffset
  const visibleMessages = messages.slice(
    Math.max(0, messages.length - viewHeight - scrollOffset),
    Math.max(0, messages.length - scrollOffset),
  );

  const hasMore = messages.length - scrollOffset > viewHeight;
  const hiddenAbove = messages.length - visibleMessages.length - scrollOffset;

  return (
    <Box flexDirection="column" height={viewHeight} overflow="hidden">
      {hiddenAbove > 0 && (
        <Text color="gray" dimColor>
          ↑ {hiddenAbove} more message{hiddenAbove > 1 ? "s" : ""} above
        </Text>
      )}
      {visibleMessages.map((msg) => {
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
      {hasMore && scrollOffset === 0 && (
        <Text color="gray" dimColor>
          ↑ scroll up to see more
        </Text>
      )}
    </Box>
  );
}
