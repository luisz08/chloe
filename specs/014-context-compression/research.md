# Research: Context Compression (014)

## Token Counting API

**Decision**: Use `client.messages.countTokens({ model, messages, system? })` — the stable (non-beta) Anthropic SDK method.

**Rationale**: Available in SDK v0.40.1 (currently installed). Returns `{ input_tokens: number }` — an exact count including system prompt and tools. This is more reliable than character-based heuristics. The method is synchronous from the caller's perspective (returns a `Promise`).

**API shape** (from `messages.d.ts`):
```typescript
countTokens(body: MessageCountTokensParams): Promise<MessageTokensCount>
// MessageCountTokensParams: { model: string, messages: MessageParam[], system?: string | ... }
// MessageTokensCount: { input_tokens: number }
```

**Location to call**: `packages/core/src/agent/agent.ts`, inside `Agent.run()`, after assembling the `messages` array (line ~135) and before calling `runLoop()` (line ~145). The `this.client`, `this.modelConfig.fastModel`, and optional system prompt string are all in scope at that point.

---

## Context Window Sizes

**Decision**: Hardcode per model prefix; default to 200,000. Move the map to `packages/core/src/agent/models.ts`.

**Rationale**: All current Claude models (Haiku, Sonnet, Opus) use 200K context. The map already exists in `packages/cli/src/ui/types.ts` as `MODEL_CONTEXT_LIMITS` + `getContextLimit(modelName)`. Moving it to core makes it available to compression logic without introducing a CLI→core dependency inversion.

**Current location**: `packages/cli/src/ui/types.ts:44–54`. Will be moved to core; CLI re-exports from core.

**Alternatives considered**: SDK metadata, API call to get model info — rejected as unnecessary overhead when all deployed models have the same limit.

---

## Injection Point in Agent Execution

**Decision**: Inject compression check in `Agent.run()` in `packages/core/src/agent/agent.ts`, between message assembly and `runLoop()`.

**Exact code flow** (current):
1. `agent.ts:124` — `const history = await storage.getMessages(sessionId)`
2. `agent.ts:125–128` — maps to `MessageParam[]`
3. `agent.ts:135` — `messages.push({ role: "user", content: userContent })`
4. **← compression check goes here** (before line 145)
5. `agent.ts:145` — `await runLoop({ messages, ... })`

**What's in scope at injection point**: `this.client`, `this.modelConfig.fastModel`, optional system prompt string (`this.subagentPromptActive ? SUBAGENT_SYSTEM_PROMPT : undefined`), `sessionId`, `storage`, `callbacks`.

**Alternatives considered**: Injecting inside `runLoop()` — rejected because `runLoop` doesn't have access to storage or the agent's model config; `agent.ts` is the right boundary.

---

## Storage: Summary Persistence

**Decision**: Add `summary TEXT DEFAULT NULL` column to the `sessions` table; extend `StorageAdapter` with `getSessionSummary(id)` and `setSessionSummary(id, summary)` methods.

**Current schema** (`sqlite.ts:8–28`):
```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  parent_id TEXT DEFAULT NULL,
  subagent_type TEXT DEFAULT NULL
);
```

**Migration pattern** (lines 84–99): try/catch `ALTER TABLE sessions ADD COLUMN` — existing pattern for `parent_id` and `subagent_type`. Same pattern applies for `summary`.

**`Session` type** (`session/types.ts:1–8`): Add `summary: string | null`.

**`StorageAdapter` interface** (`storage/adapter.ts`): Two new methods:
```typescript
getSessionSummary(id: string): Promise<string | null>;
setSessionSummary(id: string, summary: string): Promise<void>;
```

---

## Notification: CLI System Messages

**Decision**: Add `"system"` to the `MessageRole` union in `packages/cli/src/ui/types.ts`; add `onContextCompressed?: (info: CompressionInfo) => void` to `AgentCallbacks` in `packages/core/src/agent/types.ts`; handle in `App.tsx`.

**Current `ChatMessage.role`** (`cli/src/ui/types.ts:1`): `"user" | "assistant" | "tool"`. Adding `"system"`.

**Rendering**: `MessageBubble.tsx` needs cases for `"system"` in `roleLabel()` and `roleColor()`. System messages render with a distinctive amber color and label (e.g., "System").

**Notification trigger**: When compression completes in `Agent.run()`, call `callbacks.onContextCompressed?.({ compressedCount, keptCount })`. The App.tsx callback pushes a system-role `ChatMessage` with a fixed notification string.

**API mode**: The `packages/api` server calls `agent.run()` with its own callbacks. The compression event will fire but only matters if the API consumer registers `onContextCompressed`. No UI change needed in API mode — compression still happens transparently.

**Alternatives considered**: Injecting a synthetic assistant message with a special prefix — rejected because it pollutes the model's message history. A dedicated system role is cleaner and keeps notification out of the AI context.

---

## Configuration

**Decision**: Add `contextCompression.threshold` (float, default `0.75`) and `contextCompression.keepRecentCount` (int, default `20`) to `ChloeConfig` and TOML parsing in `config.ts`.

**Rationale**: Spec FR-009 and FR-010 require these to be configurable per project. The TOML config is the existing mechanism for project-level settings.

**TOML section**:
```toml
[context_compression]
threshold = 0.75
keep_recent_count = 20
```

**Alternatives considered**: `.chloe/settings.json` per-project override — left for a future iteration; TOML config is the established pattern for this codebase.
