# Data Model: ink TUI Chat Interface

**Feature**: 006-ink-tui-chat
**Date**: 2026-04-15

---

## Core Entities

### `ChatMessage`

A single entry in the conversation history as held by the UI state.

```ts
type MessageRole = "user" | "assistant" | "tool";

type MessageState =
  | "complete"     // final, no pending actions
  | "streaming"    // assistant reply in progress
  | "pending"      // tool: waiting for y/N confirmation
  | "confirmed"    // tool: user approved, executing or complete
  | "denied";      // tool: user denied

interface ChatMessage {
  id: string;          // unique per-message (e.g., crypto.randomUUID())
  role: MessageRole;
  content: string;     // raw text (user/assistant) or serialized tool input (tool)
  toolName?: string;   // populated when role === "tool"
  toolInput?: unknown; // raw input object when role === "tool"
  toolOutput?: string; // result after execution, when role === "tool" + confirmed
  state: MessageState;
  timestamp: number;   // Date.now() at creation
}
```

### `TokenUsage`

Cumulative token usage across all turns in the current session.

```ts
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

// Derived:
// totalUsed = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens
// usagePct  = totalUsed / contextLimit * 100
```

### `AppState`

Root state for the ink App component.

```ts
type UIStatus = "idle" | "thinking" | "streaming";

interface AppState {
  sessionId: string;
  modelName: string;
  contextLimit: number;       // from static model map, default 200_000
  messages: ChatMessage[];
  tokenUsage: TokenUsage;
  status: UIStatus;
  exitPrompt: boolean;        // true after first Ctrl+C, before second
  inputValue: string;         // current text in InputArea
}
```

---

## State Transitions

### Message State Machine

```
[user submits]
  → role: "user", state: "complete"

[agent starts responding]
  → role: "assistant", state: "streaming"
  → content accumulates via onToken
  
[agent finishes responding]
  → state: "complete"

[agent calls tool (default mode)]
  → role: "tool", state: "pending"
  → user types "y" → state: "confirmed" → tool executes
  → user types "N" → state: "denied"

[agent calls tool (--yes mode)]
  → role: "tool", state: "confirmed" immediately
  → tool executes, toolOutput populated
  → state remains "confirmed"
```

### UI Status Transitions

```
idle
  → "thinking"  : user submits message (before first onToken)
  → "streaming" : first onToken received
  → "idle"      : turn complete (after onUsage)
```

---

## Model Context Limit Map

```ts
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-opus-4-6":   200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5":  200_000,
};

function getContextLimit(modelName: string): number {
  for (const [prefix, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (modelName.startsWith(prefix)) return limit;
  }
  return 200_000; // safe default
}
```
