# Data Model: Subagent Session Tree

**Feature**: 011-subagent-session-tree | **Date**: 2026-04-17

## Entity Extensions

### Session (Extended)

Existing Session entity extended with parent association fields.

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | string | NO | Primary key, format varies by creation method |
| `name` | string | NO | Display title (auto-generated for subagents) |
| `createdAt` | number | NO | Creation timestamp (epoch ms) |
| `updatedAt` | number | NO | Last update timestamp (epoch ms) |
| `parentId` | string | YES | Parent session reference (null for root sessions) |
| `subagentType` | string | YES | Tool type: "vision_analyze" | "fast_query" | "deep_reasoning" (null for root) |

**Constraints**:
- Root sessions: `parentId IS NULL`, `subagentType IS NULL`
- Child sessions: `parentId NOT NULL`, `subagentType NOT NULL`
- Parent must exist (foreign key constraint ON DELETE CASCADE)
- Child session ID format: `{parentId}-{subagentType}-{timestamp}`

**State Transitions**:
```
Root Session (user-initiated)
  → Child Session (subagent call)
    → Child Session (nested subagent) [max depth 10]
```

---

### Message (Extended)

Existing Message entity with structured content for subagent messages.

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | string | NO | Primary key (UUID) |
| `sessionId` | string | NO | Foreign key to sessions |
| `role` | string | NO | "user" | "assistant" | "tool" |
| `content` | unknown | NO | Message content (JSON-serialized) |
| `createdAt` | number | NO | Creation timestamp (epoch ms) |

**Content Types**:
- Standard messages: string or Anthropic content blocks
- Subagent request: `SubagentRequestContent` object
- Subagent response: `SubagentResponseContent` object

---

### SubagentRequestContent (New Type)

User message content for subagent sessions.

```typescript
interface SubagentRequestContent {
  type: "subagent_request";
  prompt: string;
  imagePath?: string;   // For vision_analyze
  imageUrl?: string;    // For vision_analyze
  context?: string;     // For deep_reasoning
}
```

---

### SubagentResponseContent (New Type)

Assistant message content for subagent sessions.

```typescript
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
  error?: string;  // Present if call failed
}
```

---

### SessionTree (New Type)

Hierarchical session structure for tree queries.

```typescript
interface SessionTree {
  session: Session;
  messages: Message[];
  children: SessionTree[];
}
```

---

## DDL Changes

### sessions table

```sql
-- Add columns (run on adapter construction)
ALTER TABLE sessions ADD COLUMN parent_id TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN subagent_type TEXT DEFAULT NULL;

-- Add index for parent_id queries
CREATE INDEX IF NOT EXISTS idx_sessions_parent_id ON sessions(parent_id);

-- Foreign key constraint (implicit from ON DELETE CASCADE in messages)
-- SQLite foreign_keys = ON already enabled
```

**Note**: No DDL change for messages table — content field already stores JSON.

---

## Relationships

```
Session (root)
  │
  ├── Session (child, vision_analyze)
  │     └── Message (user, SubagentRequestContent)
  │     └── Message (assistant, SubagentResponseContent)
  │
  ├── Session (child, fast_query)
  │     └── Message (user, SubagentRequestContent)
  │     └── Message (assistant, SubagentResponseContent)
  │
  └── Session (child, deep_reasoning)
        └── Message (user, SubagentRequestContent)
        └── Message (assistant, SubagentResponseContent)
```

**Query patterns**:
- Direct children: `SELECT * FROM sessions WHERE parent_id = ?`
- Session tree: Recursive CTE (see research.md Q4)
- Sessions by type: `SELECT * FROM sessions WHERE subagent_type = ?`

---

## Validation Rules

| Entity | Rule | Error |
|--------|------|-------|
| Session | `parentId` must reference existing session | Foreign key violation |
| Session | `subagentType` must be valid enum value | Invalid type error |
| Session | Child ID must match format `{parent}-{type}-{ts}` | Format validation error |
| Message | `content` must serialize to JSON | Serialization error |
| Message | `SubagentResponseContent.metadata` fields required | Type validation error |

---

## Index Strategy

| Index | Purpose | Query Pattern |
|-------|---------|---------------|
| `idx_sessions_parent_id` | Child lookup | `WHERE parent_id = ?` |
| `idx_messages_session_id` (existing) | Message lookup | `WHERE session_id = ?` |

**Note**: Tree queries use recursive CTE, index on parent_id sufficient.