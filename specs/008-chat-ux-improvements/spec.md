# Spec 008: Chat UX Improvements

## Overview

Three user-facing improvements to the TUI chat experience:

1. **History replay on `--continue`** — when resuming a session, show past messages in the chat view
2. **Bash permission prompt** — instead of silently rejecting disallowed commands, ask the user
3. **"Allow in session" option** — add a third choice `s` to all y/n permission prompts

---

## Feature 1: History replay on `chat --continue` / `--session`

### Problem

When the user runs `chloe chat --continue` or `chloe chat --session <id>`, the `messages` state
in `App.tsx` starts as an empty array. The TUI shows "Start a conversation." even though the
session has prior history. The agent loads history from storage for the LLM context, but the
UI never renders it.

### Behaviour

- On startup with `--continue` or `--session <id>`, load the last **50** messages for the session
  from `StorageAdapter.getMessages()`.
- Convert them to `ChatMessage[]` and pass as `initialMessages` to `App`.
- `App` initialises its `messages` state from `initialMessages` instead of `[]`.
- The existing scroll UI in `ChatView` (arrow-key scrolling) handles navigation naturally.

### Scope

This feature is **UI-only**. The LLM continues to receive the full session history on every
`agent.run()` call (no changes to `agent.ts`). The 50-message limit applies only to what is
rendered in the TUI on startup.

### Message conversion

Stored `Message` records have `role: "user" | "assistant"` and `content: unknown`.

The goal is to reconstruct a readable conversation view. Tool calls and their results are paired
and rendered as collapsed `ToolBlock`-style entries (matching the "✓ bash ls" style used during
live sessions).

| Stored role | Stored content shape | UI treatment |
|-------------|---------------------|--------------|
| `"user"` | `string` | User bubble, `state: "complete"` |
| `"user"` | `Array<{type:"tool_result", tool_use_id, content}>` | Paired with the preceding assistant `tool_use` block — fill in `toolOutput`, mark `state: "done"` |
| `"assistant"` | `Array<TextBlock \| ToolUseBlock>` | For each `text` block: assistant bubble. For each `tool_use` block: a tool entry with `toolName`, `toolInput`, `state: "done"` (output filled when the matching `tool_result` is processed). Skip assistant entries with no text and no tool_use blocks. |

**Pairing algorithm:** iterate the stored messages in order. When a `tool_use` block is
encountered, record its `id → ChatMessage` in a lookup map. When a `tool_result` is encountered,
look up by `tool_use_id` and set `toolOutput`.

Limit: take the **last 50 raw stored messages** before conversion (not 50 qualifying messages
after filtering). This keeps the display window predictable regardless of tool-call density.

### Implementation touch-points

| File | Change |
|------|--------|
| `packages/cli/src/commands/chat.ts` | When resuming, call `storage.getMessages(sessionId)`, convert, pass `initialMessages` to `App` |
| `packages/cli/src/ui/App.tsx` | Accept `initialMessages?: ChatMessage[]` prop; use as initial state |

No changes to `core` required.

---

## Feature 2: Bash permission prompt for disallowed commands

### Problem

`bash.ts` calls `validateBashCommand()`; when a binary is not in the allowed list it immediately
returns the error string `"Command not allowed: <name> is not in the allowed commands list"`.
The agent then reports the failure to the LLM instead of offering the user a chance to permit it.

### Behaviour

1. When `validateBashCommand` would reject a command, check for a `requestPermission` callback.
2. If present, call `requestPermission(binaryName)` and suspend execution until the user responds.
3. If the user allows (`true`): proceed with executing the command.
4. If the user denies (`false`): return the original error string so the agent can try an alternative.
5. If no callback is present (e.g., API server): keep current silent-reject behaviour.

### "Allow in session" for bash commands

The `requestPermission` callback is provided by the CLI/UI layer. The UI can implement
"allow in session" internally: when the user picks that option, the binary is added to an
in-memory `Set<string>` and all future calls with that binary return `true` immediately without
prompting.

### Implementation touch-points

| File | Change |
|------|--------|
| `packages/core/src/tools/bash.ts` | `createBashTool` accepts optional `permissionRef?: { current: ((bin: string) => Promise<boolean>) \| null }`. In `execute`, if sandbox rejects, call `permissionRef.current?.(binaryName)` before returning error. |
| `packages/core/src/agent/agent.ts` | Add `private readonly bashPermissionRef` on `Agent`. Pass to `createBashTool`. In `run()`, set `bashPermissionRef.current = callbacks.confirmBashCommand ?? null`, clear in `finally`. |
| `packages/core/src/agent/types.ts` | Add `confirmBashCommand?: (binaryName: string) => Promise<boolean>` to `AgentCallbacks`. |
| `packages/core/src/tools/index.ts` | `createDefaultTools` forwards `permissionRef` param to `createBashTool`. |
| `packages/cli/src/ui/App.tsx` | Add `sessionAllowedBinaries: Set<string>` state + `bashPermissionResolveRef`. Build `confirmBashCommand` callback. Render `BashPermissionBlock` when a bash permission is pending. |
| `packages/cli/src/ui/BashPermissionBlock.tsx` | New component: selection-list prompt for bash command permission (see UI spec below). |

### New `BashPermissionBlock` props

```typescript
interface BashPermissionBlockProps {
  binaryName: string;
  onResult: (result: 'allow-once' | 'deny' | 'allow-session') => void;
}
```

Rendered below `ChatView`, above `InputArea`, when a bash permission request is pending.
While pending, `InputArea` is disabled (same as during tool confirmation).

---

## Selection list UI (Feature 2 & 3)

Both the tool confirmation prompt (`ToolBlock`) and the bash permission prompt
(`BashPermissionBlock`) are replaced with an **interactive selection list** component.

### Visual design

```
┌─ Tool: bash ──────────────────────────────────┐
│  { "command": "git status" }                   │
│                                                │
│  ▶ Allow once                                  │
│    Deny                                        │
│    Allow in this session                       │
└────────────────────────────────────────────────┘
```

- Up/Down arrow keys move the `▶` cursor.
- Enter confirms the selected option.
- The highlighted item uses a distinct colour (e.g. `cyan`); others are `gray`.
- No single-key shortcuts — all interaction is via arrows + Enter.

### Shared `SelectList` component

Extract a reusable `SelectList` component to `packages/cli/src/ui/SelectList.tsx`:

```typescript
interface SelectListProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  onSelect: (value: T) => void;
  isActive: boolean;
}
```

`ToolBlock` and `BashPermissionBlock` both use `SelectList` internally.

---

## Feature 3: "Allow in session" for tool confirmation

### Problem

The tool confirmation prompt in `ToolBlock` shows `[y/N]`. The user can only allow-once or
deny. There is no way to allow a tool for the rest of the session without using `--yes`.

### Behaviour

- Replace the `[y/N]` prompt in `ToolBlock` with a `SelectList` showing three options:
  - **Allow once** — run this tool call, ask again next time
  - **Deny** — reject this call, agent tries an alternative
  - **Allow in this session** — run now and skip confirmation for this tool for the rest of the session
- All future `confirmTool` calls for that tool name bypass the prompt and return `true`.
- The session-allowed-tools set lives in `App.tsx` state; it is not persisted.

### Implementation touch-points

| File | Change |
|------|--------|
| `packages/cli/src/ui/SelectList.tsx` | New shared component (see above). |
| `packages/cli/src/ui/ToolBlock.tsx` | Replace key-handler + text prompt with `<SelectList>`. `onConfirm` signature changes to `(result: ConfirmResult) => void`. |
| `packages/cli/src/ui/App.tsx` | Change `confirmResolveRef` to `{ current: ((r: ConfirmResult) => void) \| null }`. Add `sessionAllowedTools: Set<string>` state. In `handleToolConfirm('session')`: add tool name to set. In `confirmTool` callback: skip prompt if tool name is in set. |

### `ConfirmResult` type

Add to `packages/cli/src/ui/types.ts`:

```typescript
export type ConfirmResult = 'allow-once' | 'deny' | 'allow-session';
```

---

## Out of scope

- Persisting session-allowed commands/tools across restarts (by design: session-scoped only).
- "Allow always" (add to `settings.json`) — a separate, future feature.
- Showing tool call blocks from history in the resumed view.
- Prompt for `read_file` / `write_file` path-restriction violations (those remain silent-reject).

---

## Test coverage

Each feature needs:

1. **History replay** — unit test that `chatCommand` with `--continue` calls `storage.getMessages`,
   converts results, and passes `initialMessages` to `App`; test the conversion logic separately.
2. **Bash permission prompt** — unit test that bash tool calls `permissionRef.current` when a
   command is rejected, proceeds on `true`, returns error on `false`, and skips callback when ref
   is `null`.
3. **Session allow** — test that after `handleToolConfirm('session')`, subsequent `confirmTool`
   calls for the same tool name resolve `true` without setting `confirmResolveRef`.
