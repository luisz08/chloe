import { Box, Text } from "ink";
import type { TokenUsage, UIStatus } from "./types.js";

interface StatusBarProps {
  sessionId: string;
  modelName: string;
  tokenUsage: TokenUsage;
  contextLimit: number;
  status: UIStatus;
}

function statusColor(status: UIStatus): string {
  switch (status) {
    case "idle":
      return "gray";
    case "thinking":
      return "yellow";
    case "streaming":
      return "green";
  }
}

export function StatusBar({
  sessionId,
  modelName,
  tokenUsage,
  contextLimit,
  status,
}: StatusBarProps) {
  const totalUsed =
    tokenUsage.inputTokens +
    tokenUsage.outputTokens +
    tokenUsage.cacheReadTokens +
    tokenUsage.cacheCreationTokens;

  const pct = contextLimit > 0 ? ((totalUsed / contextLimit) * 100).toFixed(1) : "0.0";
  const limitK = `${Math.round(contextLimit / 1000)}k`;

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="cyan">[{sessionId}]</Text>
      <Text> </Text>
      <Text color="white">{modelName}</Text>
      <Text color="gray"> | </Text>
      <Text>
        {totalUsed.toLocaleString()} / {limitK} tokens ({pct}%)
      </Text>
      <Text color="gray"> | </Text>
      <Text color={statusColor(status)}>{status}</Text>
    </Box>
  );
}
