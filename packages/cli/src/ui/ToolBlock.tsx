import { Box, Text, useInput } from "ink";
import type { ChatMessage } from "./types.js";

interface ToolBlockProps {
  message: ChatMessage;
  isPending: boolean;
  onConfirm: (confirmed: boolean) => void;
}

function summarizeInput(_toolName: string, input: unknown): string {
  if (input === null || input === undefined || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  // Show first meaningful string value as a brief hint
  for (const key of ["path", "command", "query", "url", "name", "file"]) {
    if (typeof obj[key] === "string") return ` ${obj[key]}`;
  }
  const keys = Object.keys(obj);
  if (keys.length > 0 && typeof obj[keys[0] as string] === "string") {
    return ` ${obj[keys[0] as string]}`;
  }
  return "";
}

export function ToolBlock({ message, isPending, onConfirm }: ToolBlockProps) {
  useInput(
    (input) => {
      if (!isPending) return;
      if (input === "y" || input === "Y") {
        onConfirm(true);
      } else if (input === "n" || input === "N" || input === "\x1b") {
        onConfirm(false);
      }
    },
    { isActive: isPending },
  );

  const isDone = message.state === "done" || message.state === "denied";

  // Collapsed view: single summary line once tool has completed
  if (isDone) {
    const icon = message.state === "done" ? "✓" : "✗";
    const color = message.state === "done" ? "green" : "red";
    const hint = summarizeInput(message.toolName ?? "", message.toolInput);
    return (
      <Box marginBottom={0}>
        <Text color="gray"> </Text>
        <Text color={color}>{icon}</Text>
        <Text color="gray"> {message.toolName ?? "tool"}</Text>
        <Text color="gray" dimColor>
          {hint}
        </Text>
      </Box>
    );
  }

  // Expanded view: pending confirmation
  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
    >
      <Box gap={1}>
        <Text color="yellow" bold>
          Tool
        </Text>
        <Text bold>{message.toolName ?? ""}</Text>
        <Text color="yellow" dimColor>
          [pending confirmation]
        </Text>
      </Box>
      {message.toolInput !== undefined && (
        <Box paddingLeft={2}>
          <Text dimColor>{JSON.stringify(message.toolInput, null, 2)}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="yellow">Confirm? [y/N]: </Text>
      </Box>
    </Box>
  );
}
