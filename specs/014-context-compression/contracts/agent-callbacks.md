# Contract: AgentCallbacks Extension

## Overview

The `AgentCallbacks` interface (in `packages/core/src/agent/types.ts`) is the primary contract between the agent core and its consumers (CLI, API, tests). This document defines the extension for context compression.

## New Callback

```typescript
export interface CompressionInfo {
  compressedCount: number; // messages summarized
  keptCount: number;       // messages kept verbatim
}

export interface AgentCallbacks {
  onToken?: (text: string) => void;
  onToolCall?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, output: string) => void;
  confirmTool?: (name: string, input: unknown) => Promise<boolean>;
  confirmBashCommand?: (binaryName: string) => Promise<boolean>;
  onUsage?: (usage: TurnUsage) => void;
  onContextCompressed?: (info: CompressionInfo) => void; // NEW
}
```

## Invocation Contract

- Called once per compression event, synchronously (not awaited), before the compressed messages are sent to the model
- `compressedCount`: number of messages that were summarized (all messages except the most recent `keepRecentCount`)
- `keptCount`: number of messages kept verbatim (≤ `keepRecentCount`)
- If compression fails, `onContextCompressed` is NOT called; instead an error is thrown
- Multiple compression events in a session each trigger a separate call

## Consumer Responsibilities

- **CLI (`App.tsx`)**: Push a system-role `ChatMessage` to the messages state with the notification text
- **API (`packages/api`)**: May ignore; compression still occurs transparently
- **Tests**: May use to assert compression occurred and verify counts

## Error Contract

If compression fails (summarization API error or storage write error), `Agent.run()` throws. The error propagates to the caller. No partial state is written. The original pre-compression message array is discarded and the turn fails.
