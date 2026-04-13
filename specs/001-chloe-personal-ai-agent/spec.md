# Feature Specification: Chloe — Personal AI Agent

**Feature Branch**: `001-chloe-personal-ai-agent`
**Created**: 2026-04-13
**Status**: Draft
**Input**: User description: "AI agent project using Bun, strict TypeScript, Biome static analysis, DRY, unit tests for important logic. CLI + REST/SSE API. Anthropic Claude. ReAct loop with human-in-the-loop. Named sessions with SQLite persistence (pluggable). Plugin-ready tool registry. Personal assistant + data analysis domain."

## User Scenarios & Testing

### User Story 1 — Start a named session and chat (Priority: P1)

A user opens the CLI, creates or resumes a named session, sends a message, and receives a streaming response from the AI assistant.

**Why this priority**: This is the core value loop. Everything else builds on it. A user can get value from this single story alone.

**Independent Test**: Run `chloe chat --session my-session`, send "Hello", observe streamed reply. Exit and re-run — prior context is recalled.

**Acceptance Scenarios**:

1. **Given** no existing session named "demo", **When** `chloe chat --session demo` is run and the user sends a message, **Then** a new session is created and the assistant responds with a streamed reply.
2. **Given** an existing session "demo" with prior messages, **When** `chloe chat --session demo` is run again, **Then** prior conversation history is loaded and the assistant has context from the previous exchange.
3. **Given** a message is sent, **When** the assistant responds, **Then** tokens are streamed to the terminal in real time (not buffered until completion).
4. **Given** the API key environment variable is missing, **When** the user starts `chloe chat`, **Then** the tool exits immediately with a clear, actionable error message.

---

### User Story 2 — Human-in-the-loop tool confirmation (Priority: P2)

The agent proposes a tool action; the user sees the tool name and arguments and confirms or denies before execution continues.

**Why this priority**: Core safety and trust mechanism. Users must be in control of what actions the agent takes on their behalf.

**Independent Test**: Prompt the agent to "echo back 'hello world'". Observe confirmation prompt showing tool name and arguments. Confirm → tool executes and output appears. Deny → agent acknowledges the denial gracefully.

**Acceptance Scenarios**:

1. **Given** the agent decides to call a tool, **When** human-in-the-loop mode is active (default), **Then** the CLI displays the tool name and its arguments and waits for explicit user confirmation (y/n) before executing.
2. **Given** the user denies a tool call, **When** the agent continues its reasoning loop, **Then** it receives a "tool denied by user" outcome and continues without crashing or losing session state.
3. **Given** the `--yes` flag is passed to `chloe chat`, **When** a tool call is proposed, **Then** it executes automatically without prompting.

---

### User Story 3 — API service with streaming endpoint (Priority: P3)

A client application sends a message to a session via HTTP and receives a streaming response as server-sent events.

**Why this priority**: Enables integration with other tools and future UI clients without requiring the CLI.

**Independent Test**: Start `chloe serve`. POST to `/sessions/s1/messages` with `{"content": "Hello"}`. Observe response as `text/event-stream` with token delta events, ending with a `[DONE]` event.

**Acceptance Scenarios**:

1. **Given** the API service is running, **When** `POST /sessions/:id/messages` is called with a message body, **Then** the response streams token events as `text/event-stream`.
2. **Given** a session does not exist, **When** a message is posted to that session ID, **Then** a new session is created automatically and the agent responds.
3. **Given** `GET /sessions` is called, **Then** a JSON list of all sessions is returned with ID, created-at timestamp, and message count.
4. **Given** `DELETE /sessions/:id` is called, **Then** the session and all its history are permanently removed and the endpoint returns success.
5. **Given** an invalid request (missing body, unknown session on DELETE), **When** the API receives it, **Then** it returns a JSON error response with an appropriate HTTP status code.

---

### User Story 4 — Session management via CLI (Priority: P3)

A user can list and delete sessions from the command line to manage their conversation history.

**Why this priority**: Basic housekeeping for a personal-use tool. Low effort, high usability.

**Independent Test**: Create two sessions, run `chloe sessions list` — both appear. Run `chloe sessions delete demo` — session is gone from subsequent `list` output.

**Acceptance Scenarios**:

1. **Given** multiple sessions exist, **When** `chloe sessions list` is run, **Then** all sessions are printed with their ID, created-at, and last-active timestamps.
2. **Given** a session exists, **When** `chloe sessions delete <id>` is run, **Then** the session is removed and the command exits cleanly.

---

### Edge Cases

- What happens when the API key environment variable is missing? → Exit immediately with a clear, actionable error message identifying the missing variable.
- What happens when the agent calls a tool that is not registered? → The agent receives a "tool not found" observation and the loop continues without crashing.
- What happens when the conversation history grows very large? → History truncation is out of scope for v1; no maximum is enforced. (See Assumptions.)
- What happens when the user presses Ctrl-C during a streaming response? → Interrupt is caught gracefully: the partial response is preserved in session history and the process exits cleanly.
- What happens when a session name contains spaces or special characters? → The name is either rejected with a clear error or sanitized to a URL-safe slug; the behavior is consistent between CLI and API.
- What happens when the database file is missing or corrupted on startup? → The system re-creates an empty database and logs a warning rather than crashing.

---

## Requirements

### Functional Requirements

- **FR-001**: The system MUST expose a single core library that contains all agent logic (loop, session management, storage, tool registry). CLI and API are entry points that consume this library.
- **FR-002**: The CLI MUST support `chloe chat --session <name>` for interactive streaming conversation with the agent.
- **FR-003**: The CLI MUST support `chloe serve [--port <n>]` to start the HTTP/SSE API service.
- **FR-004**: The CLI MUST support `chloe sessions list` and `chloe sessions delete <id>` for session housekeeping.
- **FR-005**: The agent MUST implement a ReAct loop: the assistant produces a response turn (text optionally followed by a tool-call request); the system executes the requested tool (or records a denial); the tool result is fed back as an observation; the loop repeats until the assistant produces a response with no tool-call request.
- **FR-006**: The agent MUST require explicit user confirmation (y/n prompt) before executing any tool call when running in default mode. A `--yes` flag disables confirmation.
- **FR-007**: The system MUST persist all conversation turns (user messages, assistant responses, tool calls, tool results) per named session in a local database.
- **FR-008**: The storage layer MUST be defined as a named interface (`StorageAdapter`) so alternative backends can replace the default without modifying core agent logic.
- **FR-009**: The tool system MUST be defined as a named interface with: tool name, human-readable description, input schema (structured contract), and an execute function that accepts validated input and returns a result.
- **FR-010**: The system MUST ship a reference "echo" tool that returns its input unchanged. This validates the tool registry contract and serves as a development aid.
- **FR-011**: All assistant interactions MUST use streaming: tokens are forwarded to the consumer (terminal or HTTP client) in real time as they are generated.
- **FR-012**: The API service MUST expose: message submission with streaming response (`POST /sessions/:id/messages`), session list (`GET /sessions`), and session deletion (`DELETE /sessions/:id`).
- **FR-013**: The system MUST read the AI provider API key from an environment variable and fail fast with a helpful error message if the variable is absent at startup.
- **FR-014**: The API service MUST return structured error responses (consistent shape) with appropriate HTTP status codes for all error conditions (invalid input, not found, internal error).
- **FR-015**: Tools MUST be registered at agent construction time by providing a list of tool instances. Dynamic runtime registration is out of scope for v1.

### Non-Functional Requirements

- **NFR-001**: The system MUST run on Bun (≥ 1.1) without requiring Node.js compatibility shims.
- **NFR-002**: All source code MUST use TypeScript with the strictest available settings enabled (strict mode, exact optional property types, unchecked indexed access).
- **NFR-003**: All code MUST pass static analysis and formatting checks (Biome) with zero errors or warnings before any commit.
- **NFR-004**: No business logic MAY be duplicated between the CLI and API entry points; both MUST delegate to the core library (DRY principle).
- **NFR-005**: Unit tests MUST cover the agent loop state machine, tool registry, storage adapter contract, and session ID validation. Test coverage percentage is not numerically enforced; critical-path coverage is required.
- **NFR-006**: The test suite MUST run using Bun's built-in test runner.

### Key Entities

- **Session**: A named, persistent conversation context. Attributes: unique ID (URL-safe slug), created timestamp, last-active timestamp, ordered list of messages.
- **Message**: A single turn in a conversation. Attributes: role (user, assistant, or tool), content, timestamp, optional tool-call request, optional tool result.
- **Tool**: A pluggable capability unit. Attributes: name, description, input contract (structured schema), execute function.
- **StorageAdapter**: An interface defining how sessions and messages are read and written. The default implementation uses a local embedded database.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: A user can complete a full conversation turn (send message → receive streamed response) in a fresh session with no errors on first run.
- **SC-002**: Resuming an existing session successfully restores prior conversation history so the assistant references prior context in its reply.
- **SC-003**: A tool call in the ReAct loop correctly triggers the confirmation prompt; confirming executes the tool and its result appears in the conversation; denying is handled gracefully without session corruption.
- **SC-004**: The API service accepts a `POST /sessions/:id/messages` request and delivers a streaming response observable via standard HTTP client tools (e.g., curl).
- **SC-005**: All unit tests pass with zero failures on a clean checkout.
- **SC-006**: Static analysis and formatting checks pass with zero errors or warnings on all source files.

---

## Assumptions

- The AI provider is Anthropic Claude. The default model is the latest Sonnet release; it is overridable via an environment variable.
- No authentication or access control is applied to the API service (personal-use tool, not internet-facing).
- Data analysis capabilities (file upload, code execution, database queries) are out of scope for v1. The tool registry architecture makes them addable in future iterations.
- WebSocket support for the API is deferred to a future version; server-sent events are sufficient for v1.
- The CLI operates in interactive mode only; non-interactive or pipe mode is out of scope for v1.
- Session IDs are derived from the user-provided name by converting it to a URL-safe slug.
- Context window management and history truncation are out of scope for v1; no maximum session history size is enforced.
- Rate limiting, automatic retries, and usage cost tracking are out of scope for v1.
- The reference echo tool is the only built-in tool for v1; all additional capabilities are future plugins.
