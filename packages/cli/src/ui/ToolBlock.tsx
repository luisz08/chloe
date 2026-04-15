import { Box, Text } from "ink";
import { SelectList } from "./SelectList.js";
import type { ChatMessage, ConfirmResult } from "./types.js";

interface ToolBlockProps {
  message: ChatMessage;
  isPending: boolean;
  onConfirm: (result: ConfirmResult) => void;
}

const CONFIRM_OPTIONS: Array<{ value: ConfirmResult; label: string }> = [
  { value: "allow-once", label: "Allow once" },
  { value: "deny", label: "Deny" },
  { value: "allow-session", label: "Allow in this session" },
];

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
  // Collapsed view when done/denied/session-allowed
  const isDone =
    message.state === "done" ||
    message.state === "confirmed" ||
    message.state === "denied" ||
    message.state === "session-allowed";

  if (isDone) {
    const icon = message.state === "denied" ? "✗" : "✓";
    const color = message.state === "denied" ? "red" : "green";
    const hint = summarizeInput(message.toolName ?? "", message.toolInput);
    return (
      <Box marginBottom={0}>
        <Text color="gray"> </Text>
        <Text color={color}>{icon}</Text>
        <Text color="gray"> {message.toolName ?? "tool"}</Text>
        <Text color="gray" dimColor>
          {hint}
        </Text>
        {message.state === "session-allowed" && (
          <Text color="gray" dimColor>
            {" "}
            (session)
          </Text>
        )}
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
      <Box marginTop={1} paddingLeft={1}>
        <SelectList options={CONFIRM_OPTIONS} onSelect={onConfirm} isActive={isPending} />
      </Box>
    </Box>
  );
}
