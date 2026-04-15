# Feature Specification: Chat Session Command Refactor

**Feature Branch**: `007-chat-session-refactor`
**Created**: 2026-04-15
**Status**: Draft
**Input**: User description: "修改chat的会话命令：`chat` - 启动新的会话，会话id自动生成；`chat --continue` - 启动上一个会话；`chat --session <session id>` - 启动指定会话，如果会话存在，就继续指定的会话"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Start new session with auto-generated ID (Priority: P1)

A user runs `chloe chat` without any session-related flags. The system creates a new session with a time-sorted ID and a timestamp-formatted name. The user sees the session ID in the status bar and can reference it later.

**Why this priority**: This is the primary default behavior. Users should be able to start chatting immediately without thinking about session management.

**Independent Test**: Run `chloe chat`, observe a new session starts with a time-sorted ID (`YYYYMMDDHHmmss-xxxxxxx` format) displayed in the status bar. Close the session, run `chloe sessions list`, verify the new session appears with a timestamp-style name.

**Acceptance Scenarios**:

1. **Given** the user runs `chloe chat` with no flags, **When** the session starts, **Then** a new session is created with a time-sorted ID (format: `YYYYMMDDHHmmss-xxxxxxx`).
2. **Given** a new auto-generated session, **When** viewing session info, **Then** the session name is formatted as `"YYYY-MM-DD HH:mm"` (e.g., `"2026-04-15 14:30"`).
3. **Given** the user runs `chloe chat`, **When** the UI renders, **Then** the session ID is visible in the status bar.
4. **Given** the user exits the session, **When** running `chloe sessions list`, **Then** the new session appears with its timestamp name and time-sorted ID.

---

### User Story 2 — Continue most recent session (Priority: P1)

A user runs `chloe chat --continue`. The system finds the most recently active session (by `updatedAt`) and resumes it. If no sessions exist, an error message is shown and the program exits.

**Why this priority**: This enables seamless continuation of work without needing to remember or copy session IDs.

**Independent Test**: Create a session, exit, then run `chloe chat --continue`. Verify the same session resumes with its history intact. Run `chloe chat --continue` in a fresh environment (no sessions) and verify the error message.

**Acceptance Scenarios**:

1. **Given** at least one session exists, **When** the user runs `chloe chat --continue`, **Then** the session with the most recent `updatedAt` is resumed.
2. **Given** the resumed session has prior messages, **When** the UI loads, **Then** all previous messages are displayed in the conversation history.
3. **Given** no sessions exist in storage, **When** the user runs `chloe chat --continue`, **Then** an error message is printed: `"No previous session found. Use 'chloe chat' to start a new session."` and the program exits with code 1.
4. **Given** multiple sessions exist, **When** the user runs `chloe chat --continue`, **Then** the session with the highest `updatedAt` value is selected (not `createdAt`).

---

### User Story 3 — Resume specific session by ID (Priority: P1)

A user runs `chloe chat --session <id>` with a specific session ID obtained from `sessions list`. If the session exists, it is resumed with its full history. If not found, an error message is shown and the program exits.

**Why this priority**: Enables precise session selection for users who manage multiple concurrent sessions.

**Independent Test**: Run `chloe sessions list`, copy a session ID, then run `chloe chat --session <copied-id>`. Verify the correct session loads with its history. Run `chloe chat --session nonexistent-id` and verify the error message.

**Acceptance Scenarios**:

1. **Given** a valid existing session ID, **When** the user runs `chloe chat --session <id>`, **Then** that session is resumed with all its prior messages displayed.
2. **Given** a non-existent session ID, **When** the user runs `chloe chat --session <id>`, **Then** an error message is printed: `"Session '<id>' not found. Use 'chloe chat' to start a new session."` and the program exits with code 1.
3. **Given** the user provides a malformed or invalid ID string, **When** the lookup fails, **Then** the same "not found" error message is shown (no separate validation error).
4. **Given** a valid session ID, **When** the session loads, **Then** the session name (timestamp format) and ID are visible in the status bar.

---

### User Story 4 — Combine session flags with existing options (Priority: P2)

The existing `--yes`/`-y` flag for auto-confirming tool calls continues to work with all session modes: new session, continue, and specific session.

**Why this priority**: Backwards compatibility with existing feature; ensures no regression.

**Independent Test**: Run `chloe chat --yes`, verify tool calls execute without confirmation. Run `chloe chat --continue --yes`, verify same behavior on resumed session.

**Acceptance Scenarios**:

1. **Given** the user runs `chloe chat --yes`, **When** a tool call occurs, **Then** it executes automatically without confirmation.
2. **Given** the user runs `chloe chat --continue --yes`, **When** a tool call occurs in the resumed session, **Then** it executes automatically.
3. **Given** the user runs `chloe chat --session <id> --yes`, **When** a tool call occurs, **Then** it executes automatically.
4. **Given** conflicting flags like `--continue --session <id>`, **When** parsing arguments, **Then** an error is shown: `"Error: cannot use both --continue and --session"` and the program exits with code 1.

---

### Edge Cases

- **No storage database**: If the SQLite database file doesn't exist or is corrupted, appropriate errors are shown (existing behavior should handle this).
- **Empty session (no messages)**: A session with zero messages can still be resumed via `--continue` or `--session`; it just shows an empty message history.
- **Session ID with special characters**: User input for `--session` is used verbatim for lookup; no slugification or transformation is applied.
- **Very long session ID in status bar**: The session ID (approximately 22 characters) may be truncated or wrapped in the status bar if terminal width is limited; this is acceptable visual behavior.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `chloe chat` command without session flags MUST create a new session with a time-sorted ID format: `YYYYMMDDHHmmss-xxxxxxx` (14-digit timestamp + 7-character lowercase alphanumeric random suffix).
- **FR-002**: The session ID MUST be generated using a custom function that combines `Date` timestamp with random suffix from `crypto.randomUUID()`.
- **FR-003**: The session name for auto-generated sessions MUST be formatted as `"YYYY-MM-DD HH:mm"` representing the creation timestamp.
- **FR-004**: The `chloe chat --continue` flag MUST resume the session with the highest `updatedAt` value from storage.
- **FR-005**: If no sessions exist and `--continue` is used, an error MUST be printed: `"No previous session found. Use 'chloe chat' to start a new session."` and the program MUST exit with code 1.
- **FR-006**: The `chloe chat --session <id>` flag MUST attempt to load an existing session by the exact ID provided.
- **FR-007**: If `--session <id>` refers to a non-existent session, an error MUST be printed: `"Session '<id>' not found. Use 'chloe chat' to start a new session."` and the program MUST exit with code 1.
- **FR-008**: Using both `--continue` and `--session` simultaneously MUST result in an error: `"Error: cannot use both --continue and --session"` and exit with code 1.
- **FR-009**: The `--yes`/`-y` flag MUST continue to function with all session modes (new, continue, specific).
- **FR-010**: Session IDs from user input MUST NOT be slugified or transformed; they are used verbatim for lookup.
- **FR-011**: A new method `getLastSession()` MUST be added to the `StorageAdapter` interface and `SQLiteStorageAdapter` implementation.
- **FR-012**: `getLastSession()` MUST return the session with the highest `updatedAt` value, or `null` if no sessions exist.
- **FR-013**: The CLI argument parser in `packages/cli/src/index.ts` MUST be updated to handle the new flag combinations.
- **FR-014**: The session name MUST be visible in the status bar (existing UI behavior).
- **FR-015**: The command signature becomes: `chloe chat [--continue | --session <id>] [--yes]` — default behavior (no flags) creates a new session.

### Key Entities

- **Session**: Existing entity with `id`, `name`, `createdAt`, `updatedAt`. ID now supports time-sorted format (`YYYYMMDDHHmmss-xxxxxxx`); name now supports timestamp format (`"YYYY-MM-DD HH:mm"`).
- **StorageAdapter**: Interface gains new method `getLastSession(): Promise<Session | null>`.
- **ChatCommandOptions**: Updated to support `{ continue?: boolean, session?: string, yes?: boolean }` with mutual exclusivity.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running `chloe chat` creates a session within 100ms and displays the UI immediately.
- **SC-002**: The session ID is correctly displayed in the `sessions list` output after creation, with format `YYYYMMDDHHmmss-xxxxxxx`.
- **SC-003**: `chloe chat --continue` resumes the correct session (highest `updatedAt`) 100% of the time when sessions exist.
- **SC-004**: Error messages for missing sessions are displayed within 50ms of command invocation.
- **SC-005**: All existing tests continue to pass after the refactor.
- **SC-006**: The codebase passes `biome check --error-on-warnings` and `tsc --noEmit` with no errors after implementation.

---

## Assumptions

- The SQLite database schema (`sessions` table) already supports arbitrary string IDs up to reasonable lengths; time-sorted ID format (~22 characters) fits within existing constraints.
- The `updatedAt` timestamp is reliably updated by existing storage code when sessions are modified.
- Users can copy-paste IDs from `sessions list` output to use with `--session`; no partial matching or fuzzy lookup is required.
- The timestamp format `"YYYY-MM-DD HH:mm"` is sufficient as a human-readable session name; no custom naming feature is needed.
- Time-sorted IDs (`YYYYMMDDHHmmss-xxxxxxx`) enable efficient B-tree indexing in SQLite and allow chronological sorting by ID alone.

---

## Out of Scope

- Custom session names via a `--name` flag
- Partial session ID matching or fuzzy session lookup
- Session name search or filtering
- Modifying the `sessions list` output format
- Non-English error messages
- Session ID transformation/slugification