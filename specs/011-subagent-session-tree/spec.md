# Feature Specification: Subagent Session Tree

**Feature Branch**: `011-subagent-session-tree`
**Created**: 2026-04-17
**Status**: Draft
**Input**: User wants to track subagent calls as independent sessions with parent association for debugging and history replay. Subagents currently do not persist any session data or messages to SQLite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Debug Subagent Call History (Priority: P1)

A developer wants to trace what happened during a subagent call to diagnose unexpected behavior. They need to see the full request sent to the model, the complete response received, and metadata like tokens used.

**Why this priority**: Debugging is the primary use case - without this, subagent calls are opaque and untraceable, making troubleshooting impossible.

**Independent Test**: Developer can query a session tree, navigate to a specific subagent session, and view the complete request/response with metadata. This can be tested by triggering a subagent call and immediately querying its child session.

**Acceptance Scenarios**:

1. **Given** a main session that triggered `vision_analyze`, **When** developer queries session tree, **Then** they see the subagent session as a child node with its complete messages and metadata
2. **Given** a subagent session exists, **When** developer views its messages, **Then** they see the exact prompt sent, the model used, input/output tokens, elapsed time, and API message ID
3. **Given** multiple subagent calls in one session, **When** developer queries the parent session, **Then** all child sessions are listed in chronological order

---

### User Story 2 - View Session Hierarchy (Priority: P2)

A developer wants to understand the call hierarchy of a conversation - which subagents were invoked, in what order, and from which parent turns. This helps comprehend complex multi-step workflows.

**Why this priority**: Visualization of hierarchy provides context for debugging and helps developers understand agent behavior patterns.

**Independent Test**: Developer runs CLI command or API endpoint to see a tree view of session relationships. This can be tested by creating a session with nested subagent calls and viewing the tree structure.

**Acceptance Scenarios**:

1. **Given** a session with subagent calls, **When** developer runs `chloe sessions --tree`, **Then** output shows parent-child relationships in a tree format
2. **Given** a session ID, **When** developer calls `/sessions/{id}/tree` API, **Then** response contains nested session objects with parent references
3. **Given** a session with no subagent calls, **When** developer queries its children, **Then** result is empty list

---

### User Story 3 - Replay Subagent Conversation (Priority: P3)

A developer wants to replay what the subagent "thought" - seeing the exact user message and assistant response as if it were a standalone conversation. This enables isolated analysis of subagent behavior.

**Why this priority**: Replay enables deeper analysis but is secondary to basic debugging. Useful for understanding subagent decision-making patterns.

**Independent Test**: Developer queries a subagent session and sees its messages formatted as a normal conversation. This can be tested by triggering any subagent and then querying its session messages.

**Acceptance Scenarios**:

1. **Given** a subagent session, **When** developer queries its messages, **Then** messages are returned in chronological order with roles (user/assistant)
2. **Given** a subagent session with vision_analyze, **When** developer views the user message, **Then** the image content is preserved (path or URL)
3. **Given** a subagent session, **When** developer views the assistant response, **Then** full text content is preserved without truncation

---

### Edge Cases

- What happens when a subagent call fails mid-execution? The child session should still be created with partial data and error information.
- What happens when the same subagent type is called multiple times in one session? Each call creates a separate child session with unique ID.
- What happens when querying a session tree with very deep nesting? Should handle up to 10 levels of nesting without performance degradation.
- What happens when a parent session is deleted? Child sessions remain but become orphaned (parent_id points to non-existent session).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create a child session record when any subagent tool (vision_analyze, fast_query, deep_reasoning) is invoked
- **FR-002**: Each child session MUST have a parent_id field referencing the invoking session
- **FR-003**: Each child session MUST have a subagent_type field indicating which tool was invoked
- **FR-004**: Child session ID MUST be auto-generated with format `{parentId}-{type}-{timestamp}`
- **FR-005**: Child session title MUST be auto-generated with format `{type}: {prompt preview 50 chars}`
- **FR-006**: System MUST persist the subagent request as a user message in the child session
- **FR-007**: System MUST persist the subagent response as an assistant message in the child session
- **FR-008**: Each message MUST include metadata with api_message_id, model, input_tokens, output_tokens, stop_reason, elapsed_ms
- **FR-009**: System MUST return only text result to parent agent (no behavior change from current implementation)
- **FR-010**: CLI MUST support `chloe sessions --tree` command showing session hierarchy
- **FR-011**: CLI MUST support `chloe sessions <id> --children` command listing direct children
- **FR-012**: API MUST provide `GET /sessions/:id/children` endpoint returning child session list
- **FR-013**: API MUST provide `GET /sessions/:id/tree` endpoint returning nested session structure
- **FR-014**: Child sessions MUST be permanently stored (no automatic cleanup)
- **FR-015**: System MUST handle subagent call failures by creating child session with error metadata

### Key Entities

- **Session**: Represents a conversation context. Extended with `parent_id` (nullable, references parent session) and `subagent_type` (nullable, indicates which subagent tool invoked this session). Root sessions have null parent_id. Child sessions are created by subagent calls.

- **Message**: Represents a turn in a conversation. Extended metadata field to store subagent-specific information including api_message_id, model name, token counts, stop_reason, and elapsed time.

- **Session Tree**: A hierarchical structure of sessions where each node can have child sessions. Root nodes are user-initiated sessions, child nodes are subagent-created sessions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developer can retrieve complete subagent call history (prompt, response, metadata) within 2 seconds of query
- **SC-002**: Session tree query returns results in under 1 second for sessions with up to 50 child sessions
- **SC-003**: All subagent calls create child sessions with 100% reliability - no calls are lost
- **SC-004**: Metadata accuracy - stored tokens match actual API usage within 1 token variance
- **SC-005**: Parent agent behavior unchanged - subagent return values remain identical to current implementation
- **SC-006**: Developer can navigate session hierarchy using CLI or API without requiring SQL knowledge

## Assumptions

- Storage adapter already supports session and message persistence (SQLiteStorageAdapter exists)
- Subagent tools currently use direct Anthropic API calls without session awareness
- Each subagent call is a single API request-response, not a multi-turn conversation
- Session IDs are unique strings that can be extended with suffixes
- Timestamp precision of milliseconds is sufficient for distinguishing sequential subagent calls
- CLI users have access to the session storage location
- API users authenticate via existing session management endpoints
- Maximum nesting depth of 10 levels is sufficient for practical use cases
- Error handling will follow existing patterns in the codebase