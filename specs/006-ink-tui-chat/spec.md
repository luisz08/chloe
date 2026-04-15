# Feature Specification: ink TUI for chloe chat

**Feature Branch**: `006-ink-tui-chat`
**Created**: 2026-04-15
**Status**: Draft
**Input**: User description: "使用 ink 构建一个在 CLI 运行的 AI 对话界面，界面类似于 OpenCode 或者 Claude Code 这样的，并且可以记录使用了多少 token，当前模型最大 context 是多少等状态信息"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Full-screen chat session with streaming reply (Priority: P1)

A user runs `chloe chat --session work` and is presented with a full-screen terminal UI. They type a message, press Enter, and watch the assistant's reply stream in character-by-character with a blinking cursor `▍` at the end. When the reply completes, the cursor disappears and the input area re-activates.

**Why this priority**: This is the core interaction loop. All other stories build on a working conversation view.

**Independent Test**: Run `chloe chat --session demo`, send "What is 2+2?", observe the assistant reply streaming into the Chloe message block with a live cursor, then the cursor disappearing on completion.

**Acceptance Scenarios**:

1. **Given** the user runs `chloe chat --session demo`, **When** the interface initialises, **Then** a full-screen UI appears with an empty message area, a bottom status bar, and an active input area.
2. **Given** the user types a message and presses `Enter`, **When** the assistant begins responding, **Then** the reply appears in a "Chloe" block and tokens stream in with `▍` at the end.
3. **Given** the assistant response completes, **When** the final token is received, **Then** the `▍` cursor disappears and the input area becomes active again.
4. **Given** the user sends multiple messages, **When** the message list exceeds the screen height, **Then** the list scrolls so the latest message is always visible.
5. **Given** no prior session history, **When** the UI opens, **Then** a welcome hint is shown in the empty message area.
6. **Given** prior session history exists, **When** the UI opens, **Then** prior messages are loaded and displayed in the message list.

---

### User Story 2 — Status bar with real-time token and context information (Priority: P1)

The user can see a persistent status bar at the bottom of the screen showing the current session name, model, token usage, context limit, usage percentage, and current state.

**Why this priority**: Core observability requirement. Users need to know how much context they have consumed, especially for long sessions.

**Independent Test**: Run `chloe chat --session demo`, send a message, observe the status bar update to show non-zero token counts and a usage percentage. Verify the model name and session name are also visible.

**Acceptance Scenarios**:

1. **Given** the UI is open, **When** viewing the status bar, **Then** it shows: session name · model name · tokens used (input + output) · context limit · usage percentage · current state (`idle` / `thinking` / `streaming`).
2. **Given** the assistant has responded, **When** the turn completes, **Then** the token counts in the status bar reflect the cumulative usage from all turns in the session.
3. **Given** the assistant is processing, **When** waiting for the first token, **Then** the status bar state shows `thinking`.
4. **Given** tokens are streaming, **When** the reply is mid-stream, **Then** the status bar state shows `streaming`.
5. **Given** no active request, **When** the input area is active, **Then** the status bar state shows `idle`.

---

### User Story 3 — Adaptive multi-line input (Priority: P1)

The user can type multi-line messages. The input area grows automatically as content exceeds one line. Pressing `Shift+Enter` inserts a newline; `Enter` sends the message.

**Why this priority**: Necessary for sending code snippets, structured prompts, or multi-paragraph messages.

**Independent Test**: In the chat UI, type a long message spanning three lines using `Shift+Enter`. Observe the input area expand to fit. Press `Enter` and verify the full multi-line message is sent.

**Acceptance Scenarios**:

1. **Given** the user is in the input area, **When** they press `Shift+Enter`, **Then** a newline is inserted and the input area grows to accommodate it.
2. **Given** a multi-line input, **When** the user presses `Enter`, **Then** the complete multi-line message is sent as a single user turn.
3. **Given** the assistant is streaming a reply, **When** the user attempts to type, **Then** the input area is disabled and does not accept input.
4. **Given** the user presses `Ctrl+C` once, **When** not in the middle of streaming, **Then** the message "Press Ctrl+C again to exit" is displayed and current input is cleared.
5. **Given** the user presses `Ctrl+C` a second time consecutively, **Then** the program exits cleanly.
6. **Given** the user types `exit` and presses `Enter`, **Then** the program exits immediately.

---

### User Story 4 — Inline tool confirmation (Priority: P2)

When the agent decides to call a tool, a dedicated "Tool" block appears in the conversation showing the tool name and its arguments. The user types `y` or `N` within that block to confirm or deny execution.

**Why this priority**: Maintains the existing human-in-the-loop safety mechanism in the new UI.

**Independent Test**: Prompt the agent to "list files in the current directory". Observe a Tool block appear with tool name `bash` and arguments shown. Type `y` and verify the tool executes; type `N` and verify the agent continues without executing.

**Acceptance Scenarios**:

1. **Given** the agent decides to call a tool in default mode, **When** the decision is made, **Then** a "Tool" message block appears showing the tool name and formatted arguments, and the input area shows a `y/N` confirmation prompt.
2. **Given** the Tool confirmation block is active, **When** the user types `y`, **Then** the tool executes and its output appears in a follow-up block; the agent continues its loop.
3. **Given** the Tool confirmation block is active, **When** the user types `N`, **Then** the tool is denied, the agent receives a denial outcome, and continues without crashing.
4. **Given** the user ran `chloe chat --yes`, **When** a tool call is made, **Then** it executes automatically without showing any confirmation block; a record of the tool call and output still appears in the conversation.

---

### User Story 5 — Markdown rendering for assistant replies (Priority: P2)

Assistant replies that contain Markdown are rendered with appropriate terminal formatting: bold, italic, inline code, fenced code blocks, lists, and headings.

**Why this priority**: Improves readability of structured responses, especially code and lists.

**Independent Test**: Ask the assistant to "show me a markdown document with a heading, a list, and a code block". Observe the reply rendered with visible formatting (bold heading, bullet points, syntax-highlighted code block).

**Acceptance Scenarios**:

1. **Given** the assistant reply contains `**bold**` text, **When** rendered, **Then** the text appears bold in the terminal.
2. **Given** the assistant reply contains a fenced code block, **When** rendered, **Then** the code block is visually distinct (e.g., background, border, or monospace emphasis).
3. **Given** the assistant reply contains a Markdown list, **When** rendered, **Then** list items are displayed with bullet or numbered indicators.
4. **Given** tokens are streaming, **When** the reply is mid-stream and Markdown is incomplete, **Then** best-effort rendering is applied; the full Markdown parse occurs on completion.

---

### Edge Cases

- **Terminal too small** (width < 40 columns or height < 10 rows): A warning message is displayed suggesting the user resize the terminal; the UI does not crash.
- **Terminal resize during streaming**: The layout adapts automatically to the new terminal dimensions without losing message history or interrupting streaming.
- **Single reply longer than screen height**: The message area is scrollable; content is never truncated.
- **API failure during streaming**: An `[Error]` block appears in the conversation; the input area re-activates so the user can continue or retry.
- **Missing API key at startup**: The program exits before rendering the UI and prints a clear error message.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `chloe chat` command MUST launch a full-screen terminal UI that takes over the entire terminal window.
- **FR-002**: The UI MUST display messages in chronological order with clear role identifiers (You / Chloe / Tool).
- **FR-003**: Assistant replies MUST stream token-by-token with a `▍` cursor at the end of the in-progress text.
- **FR-004**: The `▍` cursor MUST disappear when streaming completes.
- **FR-005**: Assistant replies MUST be rendered with Markdown formatting (bold, italic, inline code, code blocks, lists, headings).
- **FR-006**: During streaming, best-effort Markdown rendering MUST be applied; incomplete Markdown elements that cannot be unambiguously parsed MUST be rendered as plain text rather than hidden or errored; full parse MUST occur on completion.
- **FR-007**: The message list area MUST be vertically scrollable when content exceeds the terminal height.
- **FR-008**: The input area MUST be fixed below the message list and auto-expand with content.
- **FR-009**: `Enter` MUST send the composed message; `Shift+Enter` MUST insert a newline.
- **FR-010**: The input area MUST be disabled (non-interactive) while the assistant is responding.
- **FR-011**: First `Ctrl+C` MUST display "Press Ctrl+C again to exit" and clear the current input; second consecutive `Ctrl+C` MUST exit the program.
- **FR-012**: Typing `exit` and pressing `Enter` MUST exit the program immediately.
- **FR-013**: The status bar MUST be fixed at the bottom of the screen, always visible.
- **FR-014**: The status bar MUST display: session name, model name, cumulative token usage (input + output), model context limit, usage percentage, and current state (idle / thinking / streaming).
- **FR-015**: Token counts MUST accumulate across all turns in the session from the API response usage data.
- **FR-016**: Tool calls MUST appear as inline "Tool" blocks in the conversation showing tool name and arguments.
- **FR-017**: In default mode, a `y/N` prompt MUST appear within the Tool block before execution.
- **FR-018**: With `--yes` flag, tool calls MUST execute automatically without a confirmation prompt; a record of the call and result MUST still appear in the conversation.
- **FR-019**: The command signature `chloe chat [--session <name>] [--yes]` MUST remain unchanged.
- **FR-020**: All new UI components MUST reside in `packages/cli/src/ui/` with no business logic — they consume `@chloe/core` via callbacks and props only.
- **FR-021**: No code in `@chloe/core` MUST be modified as part of this feature.

### Key Entities

- **MessageBlock**: A single entry in the conversation view with a role (You / Chloe / Tool), content, and optional state (streaming, confirmed, denied).
- **StatusBar**: A persistent display entity tracking session metadata and live token statistics.
- **ToolConfirmation**: A transient state within a Tool message block awaiting user input before resolving.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The full-screen UI renders within 1 second of running `chloe chat --session <name>`.
- **SC-002**: Assistant token streaming is visible to the user within 500 ms of the first token arriving from the API.
- **SC-003**: The status bar token count is updated after every completed assistant turn without requiring any user action.
- **SC-004**: Terminal resize during streaming causes no message loss and no UI crash.
- **SC-005**: All user interactions (send, confirm tool, exit) respond within 100ms of user input.
- **SC-006**: The codebase passes `biome check --error-on-warnings` and `tsc --noEmit` with no errors after this feature is implemented.

---

## Assumptions

- The Anthropic API response includes a `usage` object with input and output token counts; this is used to populate the status bar without any additional API calls.
- The model context limit is a static value derivable from the model name at startup (e.g., `claude-sonnet-4-6` → 200,000 tokens); no runtime API call is needed to look it up.
- The terminal environment supports standard ANSI colour and box-drawing characters (i.e., the user is on a modern macOS, Linux, or WSL terminal).
- Markdown rendering fidelity is "reasonable for a terminal" — pixel-perfect HTML rendering is not expected.
- Scroll behaviour follows the most-recent-message-visible convention; manual scroll-up to review history is supported but auto-scroll resumes on new messages.

---

## Out of Scope

- Modifications to `@chloe/core`
- Mouse support (click to focus, scroll wheel)
- Message search or filter
- Multi-session parallel views in a single terminal window
- UI changes for `chloe serve`, `chloe sessions`, or `chloe config` commands
- Syntax highlighting within code blocks (colour-coded by language)
- Image or file attachment display
