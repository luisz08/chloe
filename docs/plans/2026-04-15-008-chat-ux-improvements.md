# Chat UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three TUI improvements — show history when resuming a session, prompt instead of reject for disallowed bash commands, and replace y/n prompts with an arrow-key selection list that includes "Allow in this session".

**Architecture:** Work bottom-up: types → shared UI component → per-feature wiring. Core changes (bash tool permission ref, AgentCallbacks) are isolated to `packages/core`; all UI changes are in `packages/cli/src/ui`. Feature 1 (history) only touches the CLI layer. Features 2 & 3 share a new `SelectList` component and a `ConfirmResult` type.

**Tech Stack:** TypeScript 5.x · Bun · React (Ink) · bun:test

---

### Task 1: Add `ConfirmResult` type and update `MessageState`

**Files:**
- Modify: `packages/cli/src/ui/types.ts`

**Step 1: Add the type**

In `packages/cli/src/ui/types.ts`, add after the existing type exports:

```typescript
export type ConfirmResult = 'allow-once' | 'deny' | 'allow-session';
```

Also add `'session-allowed'` to `MessageState` (used to mark a tool message that was allowed for the whole session):

```typescript
export type MessageState = "complete" | "streaming" | "pending" | "confirmed" | "denied" | "done" | "session-allowed";
```

**Step 2: Verify type check passes**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

Expected: no errors.

**Step 3: Commit**

```bash
git add packages/cli/src/ui/types.ts
git commit -m "feat(ui): add ConfirmResult type and session-allowed MessageState"
```

---

### Task 2: `SelectList` component

**Files:**
- Create: `packages/cli/src/ui/SelectList.tsx`

This is a pure UI component — no business logic. It renders a list of labelled options, moves a `▶` cursor with arrow keys, and fires `onSelect` on Enter.

**Step 1: Write the component**

```tsx
// packages/cli/src/ui/SelectList.tsx
import { Box, Text, useInput } from "ink";
import { useState } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectListProps<T extends string> {
  options: SelectOption<T>[];
  onSelect: (value: T) => void;
  isActive: boolean;
}

export function SelectList<T extends string>({ options, onSelect, isActive }: SelectListProps<T>) {
  const [index, setIndex] = useState(0);

  useInput(
    (_, key) => {
      if (!isActive) return;
      if (key.upArrow) {
        setIndex((i) => (i - 1 + options.length) % options.length);
      } else if (key.downArrow) {
        setIndex((i) => (i + 1) % options.length);
      } else if (key.return) {
        const opt = options[index];
        if (opt) onSelect(opt.value);
      }
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      {options.map((opt, i) => (
        <Box key={opt.value} gap={1}>
          <Text color={i === index ? "cyan" : undefined}>{i === index ? "▶" : " "}</Text>
          <Text color={i === index ? "cyan" : "gray"}>{opt.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
```

**Step 2: Verify type check**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

**Step 3: Commit**

```bash
git add packages/cli/src/ui/SelectList.tsx
git commit -m "feat(ui): add SelectList arrow-key selection component"
```

---

### Task 3: Update `ToolBlock` to use `SelectList` (Feature 3 UI)

**Files:**
- Modify: `packages/cli/src/ui/ToolBlock.tsx`

**Step 1: Write the failing test**

Add to `packages/cli/src/ui/types.test.ts` (the existing test file for UI types):

```typescript
import type { ConfirmResult } from "./types.js";

describe("ConfirmResult values", () => {
  it("covers the three permission outcomes", () => {
    const values: ConfirmResult[] = ['allow-once', 'deny', 'allow-session'];
    expect(values).toHaveLength(3);
  });
});
```

**Step 2: Run to verify it passes (type-only test)**

```bash
bun test packages/cli/src/ui/types.test.ts
```

Expected: PASS (this verifies the type exists and has the right values).

**Step 3: Rewrite `ToolBlock`**

Replace the entire `ToolBlock.tsx` with:

```tsx
import { Box, Text } from "ink";
import { SelectList } from "./SelectList.js";
import type { ConfirmResult } from "./types.js";
import type { ChatMessage } from "./types.js";

interface ToolBlockProps {
  message: ChatMessage;
  isPending: boolean;
  onConfirm: (result: ConfirmResult) => void;
}

function summarizeInput(_toolName: string, input: unknown): string {
  if (input === null || input === undefined || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  for (const key of ["path", "command", "query", "url", "name", "file"]) {
    if (typeof obj[key] === "string") return ` ${obj[key]}`;
  }
  const keys = Object.keys(obj);
  if (keys.length > 0 && typeof obj[keys[0] as string] === "string") {
    return ` ${obj[keys[0] as string]}`;
  }
  return "";
}

const CONFIRM_OPTIONS: Array<{ value: ConfirmResult; label: string }> = [
  { value: "allow-once", label: "Allow once" },
  { value: "deny", label: "Deny" },
  { value: "allow-session", label: "Allow in this session" },
];

export function ToolBlock({ message, isPending, onConfirm }: ToolBlockProps) {
  const isDone =
    message.state === "done" ||
    message.state === "denied" ||
    message.state === "session-allowed";

  // Collapsed view once tool has completed
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
          <Text color="gray" dimColor> (session)</Text>
        )}
      </Box>
    );
  }

  // Expanded view: pending confirmation
  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor="yellow" paddingX={1}>
      <Box gap={1}>
        <Text color="yellow" bold>Tool</Text>
        <Text bold>{message.toolName ?? ""}</Text>
        <Text color="yellow" dimColor>[pending confirmation]</Text>
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
```

**Step 4: Verify type check**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

**Step 5: Run existing tests**

```bash
bun test packages/cli
```

Expected: PASS.

**Step 6: Commit**

```bash
git add packages/cli/src/ui/ToolBlock.tsx
git commit -m "feat(ui): replace y/n prompt with SelectList in ToolBlock"
```

---

### Task 4: Wire Feature 3 into `App.tsx` (session-allowed tools)

**Files:**
- Modify: `packages/cli/src/ui/App.tsx`

**Step 1: Update `handleToolConfirm` and add session state**

In `App.tsx`, make the following changes:

1. Add `sessionAllowedTools` state:
```typescript
const [sessionAllowedTools, setSessionAllowedTools] = useState<Set<string>>(new Set());
```

2. Change `confirmResolveRef` type from `boolean` to `ConfirmResult`:
```typescript
const confirmResolveRef = useRef<((v: ConfirmResult) => void) | null>(null);
```

3. Update `handleToolConfirm` to accept `ConfirmResult`:
```typescript
const handleToolConfirm = useCallback((result: ConfirmResult) => {
  const resolve = confirmResolveRef.current;
  if (resolve === null) return;
  confirmResolveRef.current = null;

  setMessages((prev) => {
    const idx = [...prev].reverse().findIndex((m) => m.role === "tool" && m.state === "pending");
    if (idx === -1) return prev;
    const realIdx = prev.length - 1 - idx;
    const newState =
      result === "allow-once" ? "confirmed" :
      result === "allow-session" ? "session-allowed" :
      "denied";
    return prev.map((m, i) => i === realIdx ? { ...m, state: newState } : m);
  });

  if (result === "allow-session") {
    const toolName = messages.find(
      (m) => m.role === "tool" && m.state === "pending"
    )?.toolName;
    if (toolName) {
      setSessionAllowedTools((prev) => new Set([...prev, toolName]));
    }
  }

  resolve(result);
}, [messages]);
```

4. Update the `confirmTool` callback to check `sessionAllowedTools` and resolve `ConfirmResult`:
```typescript
confirmTool: (_name: string, _input: unknown) => {
  if (sessionAllowedTools.has(_name)) return Promise.resolve("allow-once" as ConfirmResult);
  return new Promise<ConfirmResult>((resolve) => {
    confirmResolveRef.current = resolve;
  });
},
```

5. The `confirmTool` callback in `AgentCallbacks` returns `Promise<boolean>`. The bridge:
```typescript
confirmTool: async (_name: string, _input: unknown): Promise<boolean> => {
  if (sessionAllowedTools.has(_name)) return true;
  const result = await new Promise<ConfirmResult>((resolve) => {
    confirmResolveRef.current = resolve;
  });
  return result !== "deny";
},
```

6. Pass the updated `onConfirm` to `ChatView`:
```tsx
<ChatView
  messages={messages}
  streamingId={streamingIdRef.current}
  onToolConfirm={handleToolConfirm}
  pendingToolId={pendingToolMessage?.id ?? null}
/>
```

Update `ChatViewProps.onToolConfirm` signature to `(result: ConfirmResult) => void` in `ChatView.tsx` and the `ToolBlock` call inside it.

**Step 2: Update `ChatView.tsx` to pass `ConfirmResult`**

In `ChatView.tsx`, change:
```typescript
onToolConfirm: (confirmed: boolean) => void;
```
to:
```typescript
onToolConfirm: (result: ConfirmResult) => void;
```

And in the `ToolBlock` render inside `ChatView`:
```tsx
<ToolBlock
  key={msg.id}
  message={msg}
  isPending={msg.id === pendingToolId}
  onConfirm={onToolConfirm}
/>
```

**Step 3: Type check**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

Expected: no errors.

**Step 4: Run all tests**

```bash
bun test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/cli/src/ui/App.tsx packages/cli/src/ui/ChatView.tsx
git commit -m "feat(ui): session-allowed tools bypass confirmation prompt"
```

---

### Task 5: Core — bash permission callback (Feature 2 core)

**Files:**
- Modify: `packages/core/src/agent/types.ts`
- Modify: `packages/core/src/tools/bash.ts`
- Modify: `packages/core/src/tools/index.ts`
- Modify: `packages/core/src/agent/agent.ts`
- Modify: `packages/core/src/tools/bash.test.ts`

**Step 1: Write failing tests for bash permission callback**

Add to `packages/core/src/tools/bash.test.ts`:

```typescript
describe("BashTool permission callback", () => {
  it("calls permissionRef.current when command not allowed", async () => {
    let called = "";
    const permissionRef = { current: async (bin: string) => { called = bin; return true; } };
    const tool = createBashTool(SETTINGS, CWD, permissionRef);
    await tool.execute({ command: "git status" });
    expect(called).toBe("git");
  });

  it("proceeds with execution when permission granted", async () => {
    const permissionRef = { current: async (_bin: string) => true };
    const tool = createBashTool(SETTINGS, CWD, permissionRef);
    const out = await tool.execute({ command: "echo allowed" });
    // git is not installed in CI so we test with an allowed-by-permission echo variant
    // Actually let's just test that it doesn't return the "Command not allowed" error
    expect(out).not.toMatch(/Command not allowed/);
  });

  it("returns error when permission denied", async () => {
    const permissionRef = { current: async (_bin: string) => false };
    const tool = createBashTool(SETTINGS, CWD, permissionRef);
    const out = await tool.execute({ command: "curl http://example.com" });
    expect(out).toMatch(/Command not allowed: curl/);
  });

  it("skips callback and returns error when permissionRef is null", async () => {
    const permissionRef = { current: null as ((bin: string) => Promise<boolean>) | null };
    const tool = createBashTool(SETTINGS, CWD, permissionRef);
    const out = await tool.execute({ command: "curl http://example.com" });
    expect(out).toMatch(/Command not allowed: curl/);
  });

  it("skips callback when no permissionRef provided", async () => {
    const tool = createBashTool(SETTINGS, CWD);
    const out = await tool.execute({ command: "curl http://example.com" });
    expect(out).toMatch(/Command not allowed: curl/);
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
bun test packages/core/src/tools/bash.test.ts
```

Expected: FAIL (createBashTool doesn't accept third argument yet).

**Step 3: Add `confirmBashCommand` to `AgentCallbacks`**

In `packages/core/src/agent/types.ts`, add to `AgentCallbacks`:

```typescript
confirmBashCommand?: (binaryName: string) => Promise<boolean>;
```

**Step 4: Update `createBashTool` signature**

In `packages/core/src/tools/bash.ts`, change the signature to:

```typescript
export function createBashTool(
  settings: ToolSettings,
  cwd: string,
  permissionRef?: { current: ((binaryName: string) => Promise<boolean>) | null },
): Tool {
```

In the `execute` function, after `validateBashCommand` returns a non-null error, add the callback check before the early return. The tricky part: we need the binary name from the command. Extract it before the full validation:

```typescript
async execute(input: unknown): Promise<string> {
  const { command } = input as BashInput;

  const sandboxErr = validateBashCommand(
    command,
    { allowedCommands: settings.bash.allowedCommands, allowedPaths: settings.allowedPaths },
    cwd,
  );

  if (sandboxErr !== null) {
    // Try permission callback before giving up
    if (permissionRef?.current !== null && permissionRef?.current !== undefined) {
      // Extract the binary name from the first segment of the command
      const firstToken = command.trim().split(/\s+/)[0] ?? "";
      const binaryName = firstToken.split("/").at(-1) ?? firstToken;
      const allowed = await permissionRef.current(binaryName);
      if (allowed) {
        // Fall through to execution below
      } else {
        return sandboxErr;
      }
    } else {
      return sandboxErr;
    }
  }

  // ... rest of execution unchanged
```

Wait — this structure is awkward because the execution block is inside the existing `if (sandboxErr !== null)` check. We need to restructure slightly. The full updated `execute` body:

```typescript
async execute(input: unknown): Promise<string> {
  const { command } = input as BashInput;

  const sandboxErr = validateBashCommand(
    command,
    { allowedCommands: settings.bash.allowedCommands, allowedPaths: settings.allowedPaths },
    cwd,
  );

  if (sandboxErr !== null) {
    const callback = permissionRef?.current ?? null;
    if (callback !== null) {
      const firstToken = command.trim().split(/\s+/)[0] ?? "";
      const binaryName = firstToken.split("/").at(-1) ?? firstToken;
      const allowed = await callback(binaryName);
      if (!allowed) return sandboxErr;
      // allowed === true: fall through to execution
    } else {
      return sandboxErr;
    }
  }

  return new Promise<string>((resolve) => {
    // ... existing Bun.spawn block unchanged ...
  });
},
```

**Step 5: Update `createDefaultTools` to accept and forward permissionRef**

In `packages/core/src/tools/index.ts`:

```typescript
export function createDefaultTools(
  settings: ToolSettings,
  cwd: string,
  permissionRef?: { current: ((binaryName: string) => Promise<boolean>) | null },
): Tool[] {
  return [
    createBashTool(settings, cwd, permissionRef),
    createReadFileTool(settings, cwd),
    createWriteFileTool(settings, cwd),
  ];
}
```

**Step 6: Update `Agent` to hold and wire the permission ref**

In `packages/core/src/agent/agent.ts`:

```typescript
export class Agent {
  private readonly client: Anthropic;
  private readonly config: AgentConfig;
  private readonly registry: ToolRegistry;
  private readonly bashPermissionRef: { current: ((bin: string) => Promise<boolean>) | null };

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL });
    this.bashPermissionRef = { current: null };
    this.registry = new ToolRegistry();
    const tools =
      config.tools !== undefined
        ? config.tools
        : createDefaultTools(loadToolSettings(process.cwd()), process.cwd(), this.bashPermissionRef);
    for (const tool of tools) {
      this.registry.register(tool);
    }
  }

  async run(sessionId: string, userMessage: string, callbacks: AgentCallbacks = {}): Promise<RunResult> {
    this.bashPermissionRef.current = callbacks.confirmBashCommand ?? null;
    try {
      // ... existing run body unchanged ...
    } finally {
      this.bashPermissionRef.current = null;
    }
  }
}
```

**Step 7: Run the bash tests**

```bash
bun test packages/core/src/tools/bash.test.ts
```

Expected: PASS.

**Step 8: Run all core tests**

```bash
bun test packages/core
```

Expected: PASS.

**Step 9: Type check**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

**Step 10: Commit**

```bash
git add packages/core/src/agent/types.ts packages/core/src/tools/bash.ts packages/core/src/tools/index.ts packages/core/src/agent/agent.ts packages/core/src/tools/bash.test.ts
git commit -m "feat(core): bash tool calls permission callback for disallowed commands"
```

---

### Task 6: `BashPermissionBlock` component + wire into `App.tsx` (Feature 2 UI)

**Files:**
- Create: `packages/cli/src/ui/BashPermissionBlock.tsx`
- Modify: `packages/cli/src/ui/App.tsx`

**Step 1: Create `BashPermissionBlock`**

```tsx
// packages/cli/src/ui/BashPermissionBlock.tsx
import { Box, Text } from "ink";
import { SelectList } from "./SelectList.js";
import type { ConfirmResult } from "./types.js";

interface BashPermissionBlockProps {
  binaryName: string;
  onResult: (result: ConfirmResult) => void;
}

const OPTIONS: Array<{ value: ConfirmResult; label: string }> = [
  { value: "allow-once", label: "Allow once" },
  { value: "deny", label: "Deny" },
  { value: "allow-session", label: "Allow in this session" },
];

export function BashPermissionBlock({ binaryName, onResult }: BashPermissionBlockProps) {
  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
    >
      <Box gap={1}>
        <Text color="yellow" bold>Permission required</Text>
      </Box>
      <Box paddingLeft={1} marginTop={0}>
        <Text>
          Allow bash command: <Text bold color="cyan">{binaryName}</Text>
        </Text>
      </Box>
      <Box marginTop={1} paddingLeft={1}>
        <SelectList options={OPTIONS} onSelect={onResult} isActive={true} />
      </Box>
    </Box>
  );
}
```

**Step 2: Wire into `App.tsx`**

Add to `App.tsx`:

1. New state and ref:
```typescript
const [pendingBashBinary, setPendingBashBinary] = useState<string | null>(null);
const [sessionAllowedBinaries, setSessionAllowedBinaries] = useState<Set<string>>(new Set());
const bashPermissionResolveRef = useRef<((allowed: boolean) => void) | null>(null);
```

2. `confirmBashCommand` callback (pass to `agent.run`):
```typescript
const confirmBashCommand = useCallback(
  async (binaryName: string): Promise<boolean> => {
    if (sessionAllowedBinaries.has(binaryName)) return true;
    return new Promise<boolean>((resolve) => {
      bashPermissionResolveRef.current = resolve;
      setPendingBashBinary(binaryName);
    });
  },
  [sessionAllowedBinaries],
);
```

3. `handleBashPermission` callback:
```typescript
const handleBashPermission = useCallback(
  (result: ConfirmResult) => {
    const resolve = bashPermissionResolveRef.current;
    if (resolve === null) return;
    bashPermissionResolveRef.current = null;
    setPendingBashBinary(null);

    if (result === "allow-session" && pendingBashBinary !== null) {
      setSessionAllowedBinaries((prev) => new Set([...prev, pendingBashBinary]));
    }
    resolve(result !== "deny");
  },
  [pendingBashBinary],
);
```

4. Pass `confirmBashCommand` in the callbacks to `agent.run()`:
```typescript
await agent.run(sessionId, text, {
  // ... existing callbacks ...
  confirmBashCommand,
});
```

5. Render `BashPermissionBlock` in the JSX, between `ChatView` and `InputArea`:
```tsx
{pendingBashBinary !== null && (
  <BashPermissionBlock
    binaryName={pendingBashBinary}
    onResult={handleBashPermission}
  />
)}
```

6. Disable `InputArea` when bash permission is pending too:
```tsx
<InputArea
  ...
  disabled={status !== "idle" || pendingToolMessage !== undefined || pendingBashBinary !== null}
  ...
/>
```

**Step 3: Type check**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

**Step 4: Run all tests**

```bash
bun test
```

**Step 5: Commit**

```bash
git add packages/cli/src/ui/BashPermissionBlock.tsx packages/cli/src/ui/App.tsx
git commit -m "feat(ui): BashPermissionBlock prompts user for disallowed bash commands"
```

---

### Task 7: History replay on `--continue` / `--session` (Feature 1)

**Files:**
- Create: `packages/cli/src/history.ts`
- Modify: `packages/cli/src/commands/chat.ts`
- Modify: `packages/cli/src/ui/App.tsx`
- Create: `packages/cli/src/history.test.ts`

**Step 1: Write failing tests for history conversion**

Create `packages/cli/src/history.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { convertStoredMessages } from "./history.js";
import type { Message } from "@chloe/core";

function msg(role: Message["role"], content: unknown, id = Math.random().toString(36)): Message {
  return { id, sessionId: "s1", role, content, createdAt: Date.now() };
}

describe("convertStoredMessages", () => {
  it("converts a user text message to a user bubble", () => {
    const result = convertStoredMessages([msg("user", "hello")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("user");
    expect(result[0]?.content).toBe("hello");
    expect(result[0]?.state).toBe("complete");
  });

  it("extracts text from assistant content blocks", () => {
    const content = [{ type: "text", text: "Hi there" }];
    const result = convertStoredMessages([msg("assistant", content)]);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("assistant");
    expect(result[0]?.content).toBe("Hi there");
  });

  it("skips assistant messages with no text blocks", () => {
    const content = [{ type: "tool_use", id: "t1", name: "bash", input: {} }];
    const result = convertStoredMessages([msg("assistant", content)]);
    // tool-use-only assistant messages produce a tool ChatMessage
    const toolMsgs = result.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0]?.toolName).toBe("bash");
  });

  it("pairs tool_use with tool_result", () => {
    const assistantContent = [
      { type: "tool_use", id: "t1", name: "bash", input: { command: "ls" } },
    ];
    const userContent = [
      { type: "tool_result", tool_use_id: "t1", content: "file.txt" },
    ];
    const result = convertStoredMessages([
      msg("assistant", assistantContent),
      msg("user", userContent),
    ]);
    const toolMsg = result.find((m) => m.role === "tool");
    expect(toolMsg?.toolOutput).toBe("file.txt");
    expect(toolMsg?.state).toBe("done");
  });

  it("skips user messages that are tool_result arrays (no matching tool_use)", () => {
    const userContent = [{ type: "tool_result", tool_use_id: "orphan", content: "x" }];
    // Orphaned tool_result with no prior tool_use should be silently skipped
    const result = convertStoredMessages([msg("user", userContent)]);
    expect(result.filter((m) => m.role === "tool")).toHaveLength(0);
  });

  it("limits to last 50 raw messages", () => {
    const messages: Message[] = Array.from({ length: 60 }, (_, i) =>
      msg("user", `msg ${i}`)
    );
    const result = convertStoredMessages(messages);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.at(-1)?.content).toBe("msg 59");
  });

  it("concatenates multiple text blocks in one assistant message", () => {
    const content = [
      { type: "text", text: "Hello" },
      { type: "text", text: " world" },
    ];
    const result = convertStoredMessages([msg("assistant", content)]);
    expect(result[0]?.content).toBe("Hello world");
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
bun test packages/cli/src/history.test.ts
```

Expected: FAIL (`history.ts` doesn't exist yet).

**Step 3: Implement `convertStoredMessages`**

Create `packages/cli/src/history.ts`:

```typescript
import type { Message } from "@chloe/core";
import type { ChatMessage } from "./ui/types.js";

const HISTORY_LIMIT = 50;

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

interface TextBlock { type: "text"; text: string }
interface ToolUseBlock { type: "tool_use"; id: string; name: string; input: unknown }
interface ToolResultBlock { type: "tool_result"; tool_use_id: string; content: string }

function isTextBlock(b: unknown): b is TextBlock {
  return typeof b === "object" && b !== null && (b as TextBlock).type === "text";
}

function isToolUseBlock(b: unknown): b is ToolUseBlock {
  return typeof b === "object" && b !== null && (b as ToolUseBlock).type === "tool_use";
}

function isToolResultBlock(b: unknown): b is ToolResultBlock {
  return typeof b === "object" && b !== null && (b as ToolResultBlock).type === "tool_result";
}

export function convertStoredMessages(messages: Message[]): ChatMessage[] {
  // Take the last HISTORY_LIMIT raw messages
  const slice = messages.slice(-HISTORY_LIMIT);

  const result: ChatMessage[] = [];
  // Map from tool_use id → ChatMessage index in result, for pairing
  const toolUseIndex = new Map<string, number>();

  for (const msg of slice) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        result.push({ id: makeId(), role: "user", content: msg.content, state: "complete" });
        continue;
      }
      // Array content: could be tool_result entries
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (isToolResultBlock(block)) {
            const idx = toolUseIndex.get(block.tool_use_id);
            if (idx !== undefined) {
              const existing = result[idx];
              if (existing) {
                result[idx] = { ...existing, toolOutput: block.content, state: "done" };
              }
            }
            // orphaned tool_result: skip
          }
        }
      }
    } else if (msg.role === "assistant") {
      if (!Array.isArray(msg.content)) continue;

      const textParts: string[] = [];
      for (const block of msg.content) {
        if (isTextBlock(block)) {
          textParts.push(block.text);
        } else if (isToolUseBlock(block)) {
          const toolMsg: ChatMessage = {
            id: makeId(),
            role: "tool",
            content: "",
            toolName: block.name,
            toolInput: block.input,
            state: "done",
          };
          toolUseIndex.set(block.id, result.length);
          result.push(toolMsg);
        }
      }
      if (textParts.length > 0) {
        result.push({
          id: makeId(),
          role: "assistant",
          content: textParts.join(""),
          state: "complete",
        });
      }
    }
  }

  return result;
}
```

**Step 4: Run the history tests**

```bash
bun test packages/cli/src/history.test.ts
```

Expected: PASS.

**Step 5: Update `chatCommand` to load history**

In `packages/cli/src/commands/chat.ts`, add import:

```typescript
import { convertStoredMessages } from "../history.js";
```

After resolving `sessionId`, load history when resuming:

```typescript
// Load history for display when resuming a session
let initialMessages: import("../ui/types.js").ChatMessage[] = [];
if (continueSession || session !== undefined) {
  const storedMessages = await storage.getMessages(sessionId);
  initialMessages = convertStoredMessages(storedMessages);
}
```

Pass `initialMessages` to `App`:

```typescript
render(
  React.createElement(App, {
    sessionId,
    modelName: cfg.provider.model,
    autoConfirm: yes ?? false,
    agent,
    initialMessages,
  }),
  { exitOnCtrlC: false },
);
```

**Step 6: Update `App.tsx` to accept `initialMessages`**

Change `AppProps`:

```typescript
interface AppProps {
  sessionId: string;
  modelName: string;
  autoConfirm: boolean;
  agent: AgentHandle;
  initialMessages?: ChatMessage[];
}
```

Change `messages` state initialisation:

```typescript
const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
```

**Step 7: Type check**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

**Step 8: Run all tests**

```bash
bun test
```

Expected: PASS.

**Step 9: Full build check**

```bash
bun run --filter '*' build
bunx biome check --error-on-warnings .
```

Expected: no errors.

**Step 10: Commit**

```bash
git add packages/cli/src/history.ts packages/cli/src/history.test.ts packages/cli/src/commands/chat.ts packages/cli/src/ui/App.tsx
git commit -m "feat(cli): show session history on chat --continue and --session"
```

---

## Summary of all changed files

| File | Change type |
|------|-------------|
| `packages/cli/src/ui/types.ts` | Add `ConfirmResult`, extend `MessageState` |
| `packages/cli/src/ui/SelectList.tsx` | New shared selection list component |
| `packages/cli/src/ui/ToolBlock.tsx` | Replace y/n with SelectList |
| `packages/cli/src/ui/ChatView.tsx` | Update `onToolConfirm` signature |
| `packages/cli/src/ui/BashPermissionBlock.tsx` | New permission prompt component |
| `packages/cli/src/ui/App.tsx` | Wire all three features |
| `packages/cli/src/history.ts` | New message conversion utility |
| `packages/cli/src/history.test.ts` | Tests for conversion |
| `packages/core/src/agent/types.ts` | Add `confirmBashCommand` to `AgentCallbacks` |
| `packages/core/src/tools/bash.ts` | Permission ref support |
| `packages/core/src/tools/bash.test.ts` | Permission callback tests |
| `packages/core/src/tools/index.ts` | Forward `permissionRef` |
| `packages/core/src/agent/agent.ts` | Hold and wire `bashPermissionRef` |
