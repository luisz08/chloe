# Data Model: Chat Session Command Refactor

**Feature**: 007-chat-session-refactor
**Date**: 2026-04-15

## Entities

### Session (Existing - Extended)

The `Session` entity already exists with the following structure. This feature extends its ID and name formats.

| Field | Type | Description | New Behavior |
|-------|------|-------------|--------------|
| `id` | `string` | Unique identifier | New sessions: `YYYYMMDDHHmmss-xxxxxxx` format. Existing sessions unchanged. |
| `name` | `string` | Human-readable name | New sessions: `"YYYY-MM-DD HH:mm"` format. Existing sessions unchanged. |
| `createdAt` | `number` | Creation timestamp (epoch ms) | Unchanged |
| `updatedAt` | `number` | Last activity timestamp (epoch ms) | Unchanged |

**ID Format Validation**:
- Time-sorted ID: 14-digit timestamp + `-` + 7-char lowercase alphanumeric
- Example: `20260415143000-a1b2c3d`
- Total length: 22 characters

**Name Format**:
- `"YYYY-MM-DD HH:mm"` (16 characters)
- Example: `"2026-04-15 14:30"`

---

### ChatCommandOptions (New Interface)

Options passed to `chatCommand()` function.

```typescript
interface ChatCommandOptions {
  continue?: boolean;     // Resume last session
  session?: string;       // Resume specific session by ID
  yes?: boolean;          // Auto-confirm tool calls
}
```

**Mutual Exclusivity**:
- `continue` and `session` cannot both be set
- If neither set → create new session (default)

---

## Storage Interface Extension

### StorageAdapter (Extended)

```typescript
interface StorageAdapter {
  // Existing methods
  createSession(id: string, name: string): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  listSessions(): Promise<SessionSummary[]>;
  deleteSession(id: string): Promise<boolean>;
  touchSession(id: string): Promise<void>;
  appendMessage(sessionId: string, role: "user" | "assistant" | "tool", content: unknown): Promise<Message>;
  getMessages(sessionId: string): Promise<Message[]>;

  // NEW
  getLastSession(): Promise<Session | null>;
}
```

**`getLastSession()` Specification**:
- Returns: `Session` with highest `updatedAt`, or `null` if no sessions exist
- Query: `SELECT ... FROM sessions ORDER BY updated_at DESC LIMIT 1`
- Used by: `--continue` flag in CLI

---

## State Transitions

### Session Resolution Flow

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Arguments                         │
│  chat | chat --continue | chat --session <id>           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Parse Arguments                        │
│  Validate mutual exclusivity                            │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   No flags          --continue        --session <id>
   (default)                                    │
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Generate ID  │  │ getLastSession│  │ getSession(id)│
│ + Name       │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ New Session  │  │ Session?     │  │ Session?     │
│              │  │ null → error │  │ null → error │
└──────────────┘  │ found → use  │  │ found → use  │
        │         └──────────────┘  └──────────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Launch UI                              │
│  Pass session ID + name to App component                 │
└─────────────────────────────────────────────────────────┘
```

---

## No Schema Changes

SQLite schema remains unchanged:
- `sessions.id` column already stores arbitrary strings (TEXT PRIMARY KEY)
- Time-sorted ID (22 chars) fits within existing 64-char slug limit
- No migration needed