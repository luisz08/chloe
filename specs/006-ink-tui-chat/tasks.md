# Tasks: ink TUI Chat Interface

**Input**: Design documents from `/specs/006-ink-tui-chat/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: Which user story this task belongs to
- All paths are relative to the repo root

---

## Phase 1: Setup

**Purpose**: Install dependencies and prepare the package for ink development

- [x] T001 Add ink@^6.7.0, react, ink-scroll-view to packages/cli/package.json and install with `bun install`; add @types/react as dev dep

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core extension to `@chloe/core` and shared UI types — MUST be complete before any user story work

⚠️ **CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Add TurnUsage interface and optional onUsage callback to AgentCallbacks in packages/core/src/agent/types.ts (per contracts/agent-callbacks.md)
- [x] T003 [P] Add `callbacks.onUsage?.({...})` call in packages/core/src/agent/loop.ts immediately after `stream.finalMessage()` (per contracts/agent-callbacks.md)
- [x] T004 Create packages/cli/src/ui/types.ts with ChatMessage, AppState, TokenUsage, UIStatus types and getContextLimit() function (per data-model.md)

**Checkpoint**: Foundation ready — user story work can begin in parallel after this phase

---

## Phase 3: User Story 1 — Full-screen chat with streaming reply (Priority: P1) 🎯 MVP

**Goal**: Replace readline with an ink full-screen UI that renders messages and streams assistant replies

**Independent Test**: Run `chloe chat --session demo`, send "What is 2+2?", observe streaming reply with `▍` cursor, cursor disappears on completion, double Ctrl+C exits

- [x] T005 [US1] Implement packages/cli/src/ui/App.tsx: root ink component with AppState, AgentCallbacks wiring (onToken, onToolCall, onToolResult, confirmTool, onUsage), UIStatus transitions (idle→thinking→streaming→idle), and double-Ctrl+C exit logic (exitOnCtrlC: false in render options)
- [x] T006 [P] [US1] Implement packages/cli/src/ui/MessageBubble.tsx: role-labelled blocks (You / Chloe / Tool); assistant block shows raw text with `▍` cursor when state === "streaming" (Markdown added in US5 phase)
- [x] T007 [P] [US1] Implement packages/cli/src/ui/InputArea.tsx: useInput-based single-line input; Enter sends; Ctrl+J inserts newline (multi-line expansion added in US3 phase); disabled (non-interactive) when UIStatus !== "idle"; first Ctrl+C sets exitPrompt=true and clears input, second consecutive Ctrl+C exits
- [x] T008 [US1] Implement packages/cli/src/ui/ChatView.tsx: wraps MessageBubble list in ink-scroll-view ScrollView; auto-scrolls to bottom on new messages; pauses auto-scroll when user manually scrolls up; resumes on scroll-to-bottom
- [x] T009 [US1] Rewrite packages/cli/src/commands/chat.ts: remove all readline imports and logic; instantiate agent with AgentCallbacks; call `render(<App ... />, { exitOnCtrlC: false })` from ink; pass session, model, contextLimit, and callbacks to App
- [x] T010 [US1] Delete packages/cli/src/ui/stream.ts and packages/cli/src/ui/confirm.ts (replaced by ink components); verify no remaining imports

---

## Phase 4: User Story 2 — Status bar with token information (Priority: P1)

**Goal**: Persistent bottom bar showing session, model, token usage, context limit, usage %, and current state

**Independent Test**: Send a message; status bar updates with non-zero token counts and correct usage percentage; state transitions correctly between idle/thinking/streaming

- [x] T011 [US2] Implement packages/cli/src/ui/StatusBar.tsx: single-line fixed bottom component; renders `[session] model | N / limit tokens (pct%) | state`; receives all values as props from App
- [x] T012 [US2] Wire TokenUsage accumulation in App.tsx: on each onUsage callback, sum inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens into running AppState.tokenUsage; pass totals to StatusBar

---

## Phase 5: User Story 3 — Adaptive multi-line input (Priority: P1)

**Goal**: InputArea auto-expands with content; Ctrl+J inserts newline; Shift+Enter inserts newline on Kitty-protocol terminals

**Independent Test**: Type a message with `Ctrl+J` between lines; observe InputArea expand; press Enter to send the multi-line message as one turn

- [x] T013 [US3] Enhance packages/cli/src/ui/InputArea.tsx: track inputValue as string[] (lines array); render multi-line text with auto-height from line count; Ctrl+J inserts newline into current line; enable Kitty keyboard protocol in ink render options and handle Shift+Enter (key.shift + key.return) as newline insertion; Shift+Enter falls back to Ctrl+J if terminal doesn't support Kitty protocol

---

## Phase 6: User Story 4 — Inline tool confirmation (Priority: P2)

**Goal**: Tool calls appear as standalone blocks in the conversation; user types y/N to confirm or deny

**Independent Test**: Prompt agent to "list files in current directory"; observe ToolBlock with tool name and arguments; type y → tool executes; type N → agent receives denial and continues

- [x] T014 [US4] Implement packages/cli/src/ui/ToolBlock.tsx: displays tool name and formatted JSON args; shows y/N prompt; captures single-character input via useInput when state === "pending"; resolves confirmTool promise with true (y/Y) or false (N/n/Escape)
- [x] T015 [US4] Wire confirmTool callback in App.tsx: when agent calls confirmTool, add a "tool" ChatMessage with state "pending"; store Promise resolve reference; ToolBlock calls resolve on user input; on resolution set state to "confirmed" or "denied"; on --yes flag auto-resolve all confirmTool calls as true without showing pending state (still add "confirmed" ToolBlock to message list)

---

## Phase 7: User Story 5 — Markdown rendering (Priority: P2)

**Goal**: Assistant replies render Markdown (bold, italic, code, lists, headings) with streaming best-effort

**Independent Test**: Ask agent for "a markdown document with a heading, list, and code block"; observe formatted output with visible structure

- [x] T016 [US5] Add Markdown rendering to packages/cli/src/ui/MessageBubble.tsx: for role === "assistant" and state === "complete", call `Bun.markdown.ansi(content, { colors: true, columns: process.stdout.columns ?? 80 })` and render result inside ink `<Text>`; for state === "streaming", render plain accumulated content (debounce handles intermediate renders)
- [x] T017 [US5] Add streaming debounce in App.tsx: use a `useRef` buffer for accumulating tokens from onToken without triggering React state on every token; flush buffer to messages state every ~16ms via `setInterval` in a `useEffect`; cancel interval on unmount

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, welcome screen, terminal size guard, quality gates

- [x] T018 Add welcome hint to packages/cli/src/ui/ChatView.tsx: when messages array is empty, show "Start a conversation. Type a message and press Enter." in the message area
- [x] T019 Add terminal size guard in packages/cli/src/ui/App.tsx: use ink's `useStdout` to get terminal dimensions; if columns < 40 or rows < 10 render a single warning message instead of the full UI
- [x] T020 [P] Write unit tests in packages/cli/src/ui/__tests__/: test getContextLimit() with known and unknown model names; test TokenUsage accumulation logic; test ChatMessage state transitions (pending→confirmed, pending→denied)
- [x] T021 Run quality gates: `bun test`, `bunx biome check --error-on-warnings .`, `bunx tsc --noEmit -p tsconfig.check.json`; fix all failures before marking complete

---

## Dependencies

```
T001
  → T002, T003, T004 (can run in parallel after T001)
    → T005
      → T006, T007 (can run in parallel after T005)
        → T008
          → T009
            → T010
              → T011 (US2)
                → T012
                  → T013 (US3)
                    → T014 (US4)
                      → T015
                        → T016 (US5)
                          → T017
                            → T018, T019, T020 (can run in parallel)
                              → T021
```

## Parallel Execution Opportunities

**Within Phase 2**: T002 and T003 can run in parallel (different files in core)  
**Within Phase 3**: T006 and T007 can run in parallel (different UI files, no cross-dependency)  
**Within Phase 8**: T018, T019, T020 can run in parallel (different files)

## Implementation Strategy

**MVP scope (just US1 + US2)**: Complete Phases 1–4 (T001–T012). This delivers a working full-screen chat with status bar — the core value.

**Full delivery**: Complete all phases T001–T021.

**Incremental validation**: After each Phase (3, 4, 5…), run `chloe chat --session test` to manually verify the story's independent test criteria before proceeding.

## Task Summary

| Phase | Tasks | Stories | Parallel |
|-------|-------|---------|----------|
| 1 Setup | T001 | — | — |
| 2 Foundational | T002–T004 | — | T002, T003 |
| 3 US1 Streaming chat | T005–T010 | US1 | T006, T007 |
| 4 US2 Status bar | T011–T012 | US2 | — |
| 5 US3 Multi-line input | T013 | US3 | — |
| 6 US4 Tool confirmation | T014–T015 | US4 | — |
| 7 US5 Markdown | T016–T017 | US5 | — |
| 8 Polish | T018–T021 | — | T018–T020 |

**Total: 21 tasks**
