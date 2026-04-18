# Research: Subagent Session Tree

**Feature**: 011-subagent-session-tree | **Date**: 2026-04-17

## Research Questions

### Q1: How to generate deterministic, sortable child session IDs?

**Decision**: `{parentId}-{subagentType}-{timestamp}`

**Rationale**:
- Parent ID prefix enables filtering by prefix in SQLite
- Subagent type embedded enables identification without query
- Timestamp (milliseconds) distinguishes sequential calls
- Example: `session-abc-vision_analyze-1712345678123`

**Alternatives considered**:
- UUID v4: No ordering, no parent association visible
- Sequential number per parent: Requires state tracking, complex
- Hash-based: Non-sortable, collision risk

---

### Q2: How to extend Session type without breaking existing code?

**Decision**: Add nullable fields `parentId` and `subagentType` to Session interface

**Rationale**:
- Nullable fields allow existing sessions to remain valid (null values)
- TypeScript strict mode handles null checks naturally
- DDL migration adds columns with NULL default

**Alternatives considered**:
- Separate SubagentSession type: Requires type switching, violates DRY
- Metadata JSON field: Unstructured, no query efficiency

---

### Q3: How to store message metadata (tokens, model, elapsed)?

**Decision**: Extend existing `content` JSON field with structured metadata object

**Rationale**:
- No DDL change for messages table
- Existing `content: unknown` allows structured objects
- TypeScript type refinement for subagent messages

**Schema**:
```typescript
interface SubagentRequestContent {
  type: "subagent_request";
  prompt: string;
  imagePath?: string;
  imageUrl?: string;
}

interface SubagentResponseContent {
  type: "subagent_response";
  text: string;
  metadata: {
    api_message_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    stop_reason: string;
    elapsed_ms: number;
  };
}
```

**Alternatives considered**:
- Separate metadata table: Overkill for single-feature metadata
- Message metadata column: Requires DDL change, unused for other messages

---

### Q4: How to efficiently query session trees?

**Decision**: SQLite recursive CTE (WITH RECURSIVE)

**Rationale**:
- Single query fetches entire tree
- Efficient for depths up to 10 levels
- No application-side recursion needed

**Query pattern**:
```sql
WITH RECURSIVE session_tree AS (
  SELECT * FROM sessions WHERE id = ?  -- root
  UNION ALL
  SELECT s.* FROM sessions s
  JOIN session_tree st ON s.parent_id = st.id
)
SELECT * FROM session_tree ORDER BY created_at;
```

**Alternatives considered**:
- Multiple queries per level: N+1 query problem
- Adjacency list with app-side recursion: Less efficient
- Nested set model: Complex DDL, hard to maintain

---

### Q5: How to handle subagent call failures?

**Decision**: Create session before API call, persist error on failure

**Rationale**:
- Ensures session exists even on partial failure
- Error stored as assistant message with error metadata
- Debugging visibility maintained

**Flow**:
```
1. Create child session (parentId, type, title)
2. Persist request as user message
3. Call API
4. If success: persist response with metadata
5. If failure: persist error message with error metadata
6. Return text (or error text) to parent
```

**Alternatives considered**:
- Skip session on failure: No debugging visibility
- Throw without persisting: Lost error context

---

### Q6: How to pass parent session context to subagent tools?

**Decision**: Extend Tool execute signature to receive context object

**Rationale**:
- Current signature: `execute(input: unknown): Promise<string>`
- Extended: `execute(input: unknown, context?: ToolContext): Promise<string>`
- ToolContext includes sessionId, storage, client, modelConfig

**Implementation**:
- Agent passes context when calling tool execute
- Subagent tools use context.storage for session creation
- Non-subagent tools ignore context (backward compatible)

**Alternatives considered**:
- Global session state: Implicit, not testable
- Tool constructor injection: Complex for registry pattern

---

### Q7: Best practices for SQLite schema migration?

**Decision**: Add columns with NULL default in DDL, no migration script needed

**Rationale**:
- SQLite supports ALTER TABLE ADD COLUMN with NULL default
- Existing rows get NULL for new columns
- DDL runs on adapter construction (CREATE TABLE IF NOT EXISTS)

**DDL addition**:
```sql
ALTER TABLE sessions ADD COLUMN parent_id TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN subagent_type TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_parent_id ON sessions(parent_id);
```

**Alternatives considered**:
- Migration scripts: Bun/SQLite doesn't need them for additive columns
- Separate table for parent relations: More complex queries

---

## Summary

| Question | Decision | Key Tradeoff |
|----------|----------|--------------|
| Q1: Session ID | `{parentId}-{type}-{ts}` | Sortable, visible parent, no state |
| Q2: Session type | Nullable fields | Backward compatible, type-safe |
| Q3: Metadata | Content JSON extension | No DDL change, structured |
| Q4: Tree query | Recursive CTE | Efficient, single query |
| Q5: Failures | Create-first, persist error | Full visibility |
| Q6: Context passing | Extended execute signature | Explicit, testable |
| Q7: Migration | Add columns NULL default | No script, IF NOT EXISTS pattern |