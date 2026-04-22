# Feature Specification: Context Compression for Long Conversations

**Feature Branch**: `014-context-compression`  
**Created**: 2026-04-22  
**Status**: Draft  
**Input**: User description: "When context is too long, compress it to avoid request failures, amnesia, and hallucinations"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Seamless Long Session Continuation (Priority: P1)

A user has been working with chloe on a complex coding task for an extended period. The conversation history grows large enough that the next message would exceed the model's token limit and fail. Instead of crashing, chloe automatically compresses earlier history into a summary and continues the conversation, informing the user that compression occurred.

**Why this priority**: Without this, long sessions fail completely — a hard blocker for professional use. This is the core safety net that keeps the agent usable.

**Independent Test**: Start a session, fill it with enough messages to exceed 75% of the context limit, send one more message. Verify the agent responds successfully (no API failure), the user sees a compression notification, and the response is coherent with the prior conversation.

**Acceptance Scenarios**:

1. **Given** a session whose message history would push total token count above 75% of the model's context window, **When** the user sends a new message, **Then** chloe compresses earlier history, notifies the user, and responds successfully without an API token-limit error.
2. **Given** a session where compression has just occurred, **When** the user asks about something discussed in the compressed portion, **Then** chloe answers correctly using information preserved in the summary (no hallucination or denial of earlier content).
3. **Given** a very long session requiring multiple compression passes, **When** the context fills again after a previous compression, **Then** chloe compresses again (incorporating the existing summary), and the session continues correctly.

---

### User Story 2 - Persistent Summary Across Session Restarts (Priority: P2)

A user closes chloe and reopens the same session later. Even though the original messages were compressed, chloe restores the summary from storage so the conversation resumes with full awareness of prior context.

**Why this priority**: Without persistence, a compressed session loses its summary on restart, defeating the purpose of compression. This ensures sessions are durable.

**Independent Test**: Compress a session, exit chloe, reopen the same session, and ask about content from the compressed portion. Verify chloe answers correctly.

**Acceptance Scenarios**:

1. **Given** a session with a stored summary, **When** the user resumes the session in a new chloe process, **Then** chloe loads the summary alongside the recent messages and the conversation is coherent.
2. **Given** a session that has never been compressed, **When** the user resumes it, **Then** chloe loads the full message history as before (no behavior change for short sessions).

---

### User Story 3 - User Visibility of Compression Events (Priority: P3)

When compression occurs, the user is clearly informed via an in-conversation notification, so they understand why their history may appear abbreviated and can trust the agent still has the relevant context.

**Why this priority**: Without notification, users may think the agent has forgotten context or behaved unexpectedly. Transparency builds trust.

**Independent Test**: Trigger a compression event; verify a visible, clearly worded notification appears in the conversation UI.

**Acceptance Scenarios**:

1. **Given** compression has just occurred, **When** the UI renders the conversation, **Then** a system notification message is visible explaining that early history was compressed and stating how many recent messages were preserved in full.
2. **Given** the notification is displayed, **When** the user continues chatting, **Then** the notification remains visible in the scrollback (it is not ephemeral).

---

### User Story 4 - Manual Compression via `/compact` Command (Priority: P4)

A user notices their session is growing long and wants to proactively compress the history before hitting the automatic threshold — for example, before starting a new subtask and wanting a clean, summarized context.

**Why this priority**: The automatic threshold is a safety net, but users may prefer to compress on their own terms (e.g., after finishing one topic, before starting another). Proactive compression can improve response quality by keeping context tightly relevant.

**Independent Test**: In a session with at least 5 messages, type `/compact`. Verify a compression notification appears, the summary is persisted, and the next response correctly references content from before the `/compact` command.

**Acceptance Scenarios**:

1. **Given** a session with any number of messages (regardless of token count), **When** the user types `/compact`, **Then** chloe compresses the current history, saves the summary, and displays the compression notification.
2. **Given** a session with fewer messages than `keepRecentCount`, **When** the user types `/compact`, **Then** all messages are summarized (no messages are kept verbatim) and the notification is displayed.
3. **Given** a session that has already been auto-compressed, **When** the user types `/compact` again, **Then** the existing summary is incorporated into the new summary and updated in storage.
4. **Given** a session with zero messages, **When** the user types `/compact`, **Then** chloe responds with a message indicating there is nothing to compress (no error, no crash).

---

### Edge Cases

- What happens when the summarization call itself fails (network error, model error)? → Hard error surfaced to the user; no silent fallback.
- What happens when the summary alone plus recent 20 messages still exceeds the token limit? → Error is surfaced; user is informed the session is too large to compress further.
- What happens when `fastModel` is not configured separately from `defaultModel`? → Summarization uses `defaultModel`; behavior is identical.
- What happens when there are fewer than 20 messages and the limit is hit (e.g., one very large message)? → All messages are summarized; no messages are kept verbatim.
- What happens if the storage write for the summary fails? → Hard error; compression is rolled back and the original error is re-raised.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST calculate the token count of the full message history (including system prompt) before each API call.
- **FR-002**: When the token count exceeds 75% of the active model's context window, the system MUST trigger context compression before proceeding.
- **FR-003**: Compression MUST summarize all messages older than the most recent 20 into a structured natural-language summary covering: current task, completed actions, key decisions, user preferences, and important facts learned.
- **FR-004**: The compression summary MUST be generated using the `fastModel` configured for the session (falling back to `defaultModel` if not separately configured).
- **FR-005**: If summary generation fails for any reason, the system MUST raise an error to the user and MUST NOT silently fall back to truncation or any other strategy.
- **FR-006**: The compression summary MUST be persisted to the session's storage record so it survives process restarts.
- **FR-007**: When loading a session that has a stored summary, the system MUST inject the summary at the beginning of the context, followed by the most recent messages.
- **FR-008**: After compression, the system MUST insert a visible notification into the conversation informing the user that context was compressed and stating how many recent messages were preserved verbatim.
- **FR-009**: The number of recent messages to preserve verbatim (default: 20) MUST be configurable per project via `.chloe/settings.json`.
- **FR-010**: The compression threshold (default: 75% of context window) MUST be configurable per project via `.chloe/settings.json`.
- **FR-011**: If, after a previous compression, the context approaches the threshold again, compression MUST be re-triggered (incorporating the existing summary into the new summary).
- **FR-012**: The system MUST provide a `/compact` slash command that allows users to manually trigger context compression at any time, regardless of the current token count.
- **FR-013**: The `/compact` command MUST behave identically to automatic compression (same summarization logic, same persistence, same notification) except that it bypasses the token threshold check.
- **FR-014**: If the session has no messages to compress (empty history), the `/compact` command MUST respond with a user-friendly message rather than an error.

### Key Entities

- **Session Summary**: A structured text artifact representing the compressed history of a session. Attributes: session ID, summary text, created/updated timestamp, message count at time of compression.
- **Context Window Budget**: The token capacity of the active model, used to determine when compression triggers. Known via configuration or model metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sessions that previously failed with token-limit errors continue successfully after compression, with zero API failures attributable to context length.
- **SC-002**: When asked about content from a compressed portion, chloe answers correctly at least 90% of the time across representative manually-tested sessions.
- **SC-003**: Compression adds no more than 10 seconds of latency to the affected message turn.
- **SC-004**: A session's summary survives a process restart and is correctly restored 100% of the time.
- **SC-005**: The compression notification is visible to the user within 1 second of compression completing.
- **SC-006**: Sessions shorter than the compression threshold experience zero behavior change or latency increase.

## Assumptions

- The model provider's API supports token counting for a given message array before sending.
- The active model's context window size is known (via configuration or model metadata) and does not change mid-session.
- The secondary lightweight model is capable of producing coherent summaries; no specialized summarization model is needed.
- Twenty recent messages provide sufficient working context for ongoing tasks in typical chloe usage.
- Users prefer a hard failure with a clear error message over silent data loss if compression itself fails.
- Persisting compression summaries requires an update to the existing session storage format.
- The compression summary is injected as plain text context, not as a special format requiring new UI components.
