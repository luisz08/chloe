# Reviewers Guide: Context Compression for Long Conversations

**Branch**: `014-context-compression`  
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Tasks**: [tasks.md](tasks.md)

## What This Feature Does

When a session's conversation history grows to 75% of the model's context window, chloe automatically summarizes the older messages using the `fastModel`, persists the summary to SQLite, and continues the session with the summary + the most recent 20 messages. Users see a notification in the chat UI. Sessions resume correctly after restart.

---

## Coverage Matrix

| Requirement | Tasks | Covered |
|-------------|-------|---------|
| FR-001: Token count before each API call | T008, T012 | ✅ |
| FR-002: Trigger at 75% threshold | T005, T008, T012 | ✅ |
| FR-003: Summarize older messages with structured format | T008 | ✅ |
| FR-004: Use fastModel for summarization | T008 | ✅ |
| FR-005: Hard error on failure, no silent fallback | T008 | ✅ |
| FR-006: Persist summary to storage | T007, T016 | ✅ |
| FR-007: Inject stored summary at context head on load | T015, T016 | ✅ |
| FR-008: Visible notification after compression | T019, T020, T021 | ✅ |
| FR-009: Configurable keepRecentCount | T005, T008 | ✅ |
| FR-010: Configurable threshold | T005, T008 | ✅ |
| FR-011: Re-trigger with existing summary incorporated | T015, T012 | ✅ |
| SC-001: No API failures from context length | US1 path | ✅ |
| SC-002: 90% coherence on compressed content | Manual test | ✅ (manual) |
| SC-003: ≤10s compression latency | T008 (fastModel) | ✅ |
| SC-004: Summary persists across restarts | T013, T014, T016 | ✅ |
| SC-005: Notification within 1 second | T021 (synchronous) | ✅ |
| SC-006: No overhead for short sessions | T008 fast-path | ✅ |

---

## Architecture Review Points

### Core Logic (`packages/core/src/agent/compressor.ts`)
- **Critical path**: verify the fast-path skip (`messages.length ≤ keepRecentCount`) fires correctly so short sessions have zero overhead
- Verify `countTokens()` receives the system prompt when present (missed system prompt = under-counting = compression triggers too late)
- Verify the summarization prompt covers all 5 required categories from FR-003: current task, completed actions, key decisions, user preferences, important facts
- Verify `ContextTooLargeError` is thrown (not silently truncated) when even recent-only messages overflow

### Storage (`packages/core/src/storage/sqlite.ts`)
- Verify the `ALTER TABLE` migration is wrapped in try/catch (existing pattern — must be consistent)
- Verify `rowToSession()` includes `summary` field after migration
- Verify `setSessionSummary()` does a plain `UPDATE` (not upsert) — session must already exist

### Agent injection (`packages/core/src/agent/agent.ts`)
- Summary load (`getSessionSummary`) happens **before** the token check — this is the mechanism for re-compression to incorporate prior summaries (FR-011)
- Summary set (`setSessionSummary`) happens **after** successful `compressIfNeeded()` — not before
- `onContextCompressed` fires **before** `runLoop()`, so the user sees the notification immediately

### CLI notification (`packages/cli/src/ui/`)
- `"system"` role must not be included in messages sent to the Anthropic API (it's UI-only)
- The notification message must reference the actual `keptCount` from `CompressionInfo`, not a hardcoded "20"

---

## Red Flags to Check During Implementation

1. **Double-compression in one turn**: if the summary + recent messages are still over threshold after compression, the code must throw, not loop. Verify `compressIfNeeded()` is not called recursively.

2. **Summary prepend on uncompressed sessions**: `getSessionSummary()` returns `null` for fresh sessions — verify the `unshift` is guarded by a null check and doesn't push empty messages.

3. **System role leaking into API calls**: the `"system"` role in `ChatMessage` (CLI type) must never be mapped into `MessageParam` sent to Anthropic. These live in separate type hierarchies.

4. **Config backward compatibility**: existing `AgentConfig` callers (tests, CLI, API) don't pass `contextCompression`. The field must be optional with defaults applied inside `Agent.run()`.

---

## Test Coverage Requirements

| Area | Test Type | File | Status |
|------|-----------|------|--------|
| `compressIfNeeded()` — no-op path | Unit | `compressor.test.ts` | T010 |
| `compressIfNeeded()` — compress path | Unit | `compressor.test.ts` | T011 |
| `getSessionSummary()` null case | Unit | `sqlite.test.ts` | T013 |
| `setSessionSummary()` persist+retrieve | Unit | `sqlite.test.ts` | T014 |
| `getContextLimit()` known+unknown models | Unit | `models.test.ts` | T017 |
| `MessageBubble` system role rendering | Unit | `MessageBubble.test.tsx` | T018 |

---

## Spec Clarification Note

FR-009 and FR-010 reference `.chloe/settings.json` as the configuration mechanism, but the chloe codebase uses TOML (`~/.chloe/settings/config.toml`) as its primary config. The plan implements configuration via TOML and env vars, which is consistent with all other config in the codebase. The spec's mention of `.chloe/settings.json` should be read as "project configuration" rather than a specific file format.

---

## Suggested Review Order

1. `research.md` — confirm technical decisions are sound
2. `data-model.md` — verify schema and interface changes are complete
3. `contracts/agent-callbacks.md` — confirm `onContextCompressed` contract is clear
4. `plan.md` Phase 1 design section — verify the injection point and summary injection logic
5. `tasks.md` — verify all FRs are covered, task ordering is correct, [P] labels are accurate
