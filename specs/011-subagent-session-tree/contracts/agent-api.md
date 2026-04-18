# Contract: StorageAdapter Extension

**Feature**: 011-subagent-session-tree | **Date**: 2026-04-17

## Interface Extension

The `StorageAdapter` interface in `@chloe/core` is extended to support child session operations.

### Existing Interface (unchanged)

```typescript
export interface StorageAdapter {
  createSession(id: string, name: string): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  getLastSession(): Promise<Session | null>;
  listSessions(): Promise<SessionSummary[]>;
  deleteSession(id: string): Promise<boolean>;
  touchSession(id: string): Promise<void>;
  appendMessage(
    sessionId: string,
    role: "user" | "assistant" | "tool",
    content: unknown,
  ): Promise<Message>;
  getMessages(sessionId: string): Promise<Message[]>;
}
```

### New Methods

```typescript
export interface StorageAdapter {
  // ... existing methods ...

  // NEW: Create child session with parent association
  createChildSession(
    parentId: string,
    subagentType: "vision_analyze" | "fast_query" | "deep_reasoning",
    title: string,
  ): Promise<Session>;

  // NEW: Get direct children of a session
  getChildSessions(parentId: string): Promise<Session[]>;

  // NEW: Get full session tree (recursive)
  getSessionTree(rootId: string, maxDepth?: number): Promise<SessionTree>;

  // NEW: Get sessions by subagent type
  listSessionsByType(subagentType: string): Promise<SessionSummary[]>;
}
```

---

## Method Contracts

### createChildSession

**Purpose**: Create a session linked to a parent session.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `parentId` | string | YES | Parent session ID (must exist) |
| `subagentType` | enum | YES | "vision_analyze" | "fast_query" | "deep_reasoning" |
| `title` | string | YES | Display title (auto-generated or custom) |

**Returns**: `Promise<Session>` — Created child session with generated ID.

**Behavior**:
- Generates ID: `{parentId}-{subagentType}-{Date.now()}`
- Sets `parentId` and `subagentType` fields
- Throws if parent session does not exist

**Errors**:
- `ParentNotFoundError`: Parent session does not exist
- `InvalidSubagentTypeError`: Type not in allowed enum

---

### getChildSessions

**Purpose**: Retrieve direct children of a session (non-recursive).

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `parentId` | string | YES | Parent session ID |

**Returns**: `Promise<Session[]>` — Array of child sessions, ordered by `createdAt` ASC.

**Behavior**:
- Returns empty array if no children
- Does not validate parent existence (allows orphaned children queries)

---

### getSessionTree

**Purpose**: Retrieve full hierarchical tree from root session.

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `rootId` | string | YES | Root session ID |
| `maxDepth` | number | NO | Maximum recursion depth (default: 10) |

**Returns**: `Promise<SessionTree>` — Nested session structure with messages.

**SessionTree structure**:
```typescript
interface SessionTree {
  session: Session;
  messages: Message[];
  children: SessionTree[];
}
```

**Behavior**:
- Recursively fetches children up to `maxDepth`
- Includes messages for each session
- Returns single-node tree if no children
- Throws `SessionNotFoundError` if root does not exist

---

### listSessionsByType

**Purpose**: Filter sessions by subagent type (analytics/debugging).

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `subagentType` | string | YES | Filter type |

**Returns**: `Promise<SessionSummary[]>` — Sessions matching type, ordered by `updatedAt` DESC.

**Behavior**:
- Returns root sessions if type is null/empty
- Case-sensitive type matching

---

## Type Extensions

### Session (extended)

```typescript
export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  parentId: string | null;        // NEW
  subagentType: string | null;    // NEW
}
```

### SessionTree (new)

```typescript
export interface SessionTree {
  session: Session;
  messages: Message[];
  children: SessionTree[];
}
```

---

## Implementation Notes

1. **SQLiteStorageAdapter**: Implement all new methods with SQLite queries
2. **Recursive CTE**: Use `WITH RECURSIVE` for `getSessionTree`
3. **Index**: Ensure `idx_sessions_parent_id` exists
4. **Backward compatibility**: Root sessions have null `parentId`, existing code unaffected