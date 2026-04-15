# Merge Bash Permission Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the double permission prompt when executing bash commands by skipping the generic tool confirmation layer for the `bash` tool, leaving `BashPermissionBlock` as the sole user-facing prompt.

**Architecture:** When `confirmTool` is called for the `bash` tool, return `true` immediately without showing `ToolBlock`. The bash tool's own `confirmBashCommand` callback already handles user interaction at the binary level with finer granularity. The `onToolCall` handler must also set the tool message state to `"confirmed"` (not `"pending"`) for bash, so `ToolBlock` never renders a confirmation UI.

**Tech Stack:** TypeScript · React (Ink) · Bun

---

### Task 1: Skip tool confirmation for `bash` in `confirmTool`

**Files:**
- Modify: `packages/cli/src/ui/App.tsx:179-185`

**Context:** `confirmTool` is defined inside `handleSubmit`'s `agent.run()` call. When `name === "bash"`, we must return `true` immediately — no prompt, no `confirmResolveRef` setup.

- [ ] **Step 1: Update `confirmTool` in App.tsx**

In `packages/cli/src/ui/App.tsx`, find the `confirmTool` callback (around line 179) and add an early return for `bash`:

```typescript
confirmTool: async (name: string, _input: unknown): Promise<boolean> => {
  if (name === "bash") return true;
  if (sessionAllowedTools.has(name)) return true;
  const result = await new Promise<ConfirmResult>((resolve) => {
    confirmResolveRef.current = resolve;
  });
  return result !== "deny";
},
```

- [ ] **Step 2: Set bash tool message state to `"confirmed"` on creation**

In the same file, find `onToolCall` (around line 145). The tool message is created with `state: autoConfirm ? "confirmed" : "pending"`. Change it so bash is always `"confirmed"`:

```typescript
onToolCall: (name: string, input: unknown) => {
  const toolId = makeId();
  const toolMsg: ChatMessage = {
    id: toolId,
    role: "tool",
    toolName: name,
    toolInput: input,
    content: "",
    state: autoConfirm || name === "bash" ? "confirmed" : "pending",
  };
  setMessages((prev) => [...prev, toolMsg]);
},
```

- [ ] **Step 3: Run type-check and lint**

```bash
bunx tsc --noEmit -p tsconfig.check.json && bunx biome check --error-on-warnings .
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/ui/App.tsx
git commit -m "fix(ui): skip tool confirmation for bash tool, use bash permission layer only"
```

---

### Task 2: Verify manually

- [ ] **Step 1: Start the CLI and run a bash command that requires permission**

```bash
bun run --filter '*' build && bun packages/cli/src/index.ts chat
```

Type a prompt that causes the agent to run `date` or `git status`.

Expected: only **one** prompt appears — the `BashPermissionBlock` ("Permission required / Allow bash command: …"). The `ToolBlock` "pending confirmation" box must NOT appear.

- [ ] **Step 2: Verify session allow works end-to-end**

After selecting "Allow in this session" for a binary, trigger the same command again. Expected: the command runs without any prompt.

- [ ] **Step 3: Verify non-bash tools still prompt**

If any other tool (e.g., `read_file`) is called, the `ToolBlock` confirmation must still appear as before.
