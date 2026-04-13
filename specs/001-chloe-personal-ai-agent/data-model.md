# Data Model: Chloe — Personal AI Agent

**Branch**: `001-chloe-personal-ai-agent` | **Date**: 2026-04-13

---

## Entities

### Session

Represents a named, persistent conversation context.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `string` | PRIMARY KEY, URL-safe slug | Derived from user-provided name via slugification |
| `name` | `string` | NOT NULL | Original user-provided name |
| `createdAt` | `number` | NOT NULL, Unix ms timestamp | When session was first created |
| `updatedAt` | `number` | NOT NULL, Unix ms timestamp | When session was last active |

**Validation rules**:
- `id` must match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` (URL-safe slug)
- `id` max length: 64 characters
- `name` max length: 128 characters
- `name` must not be empty after trimming

**State transitions**:
- Created → Active (first message sent)
- Active → Active (each subsequent message)
- Active → Deleted (explicit delete)

---

### Message

A single turn in a conversation, stored as a serialized Anthropic `MessageParam`.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `string` | PRIMARY KEY, UUID v4 | Unique message identifier |
| `sessionId` | `string` | FK → sessions.id ON DELETE CASCADE | Parent session |
| `role` | `'user' \| 'assistant' \| 'tool'` | NOT NULL, CHECK constraint | Who produced this turn |
| `content` | `string` | NOT NULL | JSON-serialized Anthropic MessageParam content |
| `createdAt` | `number` | NOT NULL, Unix ms timestamp | When message was created |

**Note on content serialization**: The `content` field stores the full Anthropic `MessageParam` content array as JSON. This allows tool_use blocks and tool_result blocks to be stored and replayed faithfully to reconstruct the exact history array needed by the Anthropic API.

---

### Tool (in-memory only, not persisted)

Represents a pluggable capability. Defined as a TypeScript interface — not stored in the database.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique identifier, used in tool_use blocks |
| `description` | `string` | Human-readable explanation for the model |
| `inputSchema` | `object` | JSON Schema (draft-07) for input validation |
| `execute` | `function` | `(input: unknown) => Promise<string>` |

---

## SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT    PRIMARY KEY,
  session_id TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role       TEXT    NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session
  ON messages(session_id, created_at ASC);
```

**Pragmas applied on connection open**:
```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
```

---

## StorageAdapter Interface

```typescript
interface StorageAdapter {
  // Session operations
  createSession(session: Session): Promise<void>;
  getSession(id: string): Promise<Session | null>;
  listSessions(): Promise<SessionSummary[]>;
  deleteSession(id: string): Promise<boolean>;
  touchSession(id: string, updatedAt: number): Promise<void>;

  // Message operations
  appendMessage(message: Message): Promise<void>;
  getMessages(sessionId: string): Promise<Message[]>;
}

interface SessionSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}
```

---

## Session ID Derivation

User-provided session name → URL-safe slug:

```
"My Project"       → "my-project"
"hello world"      → "hello-world"
"test123"          → "test123"
"a--b"             → "a-b"   (consecutive hyphens collapsed)
"  spaces  "       → "spaces" (trimmed)
```

Rules:
1. Lowercase
2. Replace non-alphanumeric characters with `-`
3. Collapse consecutive `-` to single `-`
4. Trim leading/trailing `-`
5. Reject if result is empty or longer than 64 characters
