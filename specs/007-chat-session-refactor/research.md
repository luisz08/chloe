# Research: Chat Session Command Refactor

**Feature**: 007-chat-session-refactor
**Date**: 2026-04-15

## Research Topics

### 1. Time-Sorted ID Generation

**Decision**: Custom format `YYYYMMDDHHmmss-xxxxxxx` (14-digit timestamp + 7-char random suffix)

**Rationale**:
- Pure TypeScript implementation with no npm dependencies
- Uses `Date` object for timestamp and `crypto.randomUUID()` for random suffix
- Time-sorted IDs enable efficient B-tree indexing in SQLite
- Human-readable: users can infer creation time from ID
- Compact (~22 chars) vs UUID (36 chars)

**Alternatives Considered**:
| Option | Format | Pros | Cons | Rejected Because |
|--------|--------|------|------|------------------|
| UUID v4 | `a1b2c3d4-...` | Standard | No time ordering, 36 chars | Poor index performance |
| UUID v7 | `019449a8-...` | Time-sorted, standard | Requires npm package (`uuidv7`) | Added dependency |
| ULID | `01ARZ3NDEK...` | Time-sorted, 26 chars | Requires npm package (`ulid`) | Added dependency |
| Timestamp-only | `20260415143000` | Simple | Collision risk at same second | Non-unique |

**Implementation Reference**:
```typescript
export function generateSessionId(): string {
  const timestamp = new Date().toISOString()
    .replace(/[-:TZ]/g, '')
    .slice(0, 14);
  const random = crypto.randomUUID().slice(0, 8);
  return `${timestamp}-${random}`;
}
```

---

### 2. Session Name Formatting

**Decision**: `"YYYY-MM-DD HH:mm"` format (e.g., `"2026-04-15 14:30"`)

**Rationale**:
- Human-readable, matches common datetime display
- Consistent with session ID timestamp prefix (just formatted differently)
- No locale dependency - uses ISO-style format

**Implementation Reference**:
```typescript
export function formatSessionName(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
```

---

### 3. SQLite Query for Last Session

**Decision**: Query by `updatedAt DESC LIMIT 1`

**Rationale**:
- Existing `listSessions()` already uses `ORDER BY updated_at DESC`
- `updatedAt` reflects actual session activity (last message added)
- Simple query, no schema changes needed

**Implementation Reference**:
```typescript
async getLastSession(): Promise<Session | null> {
  const row = this.db
    .prepare<SessionRow, []>(
      "SELECT id, name, created_at, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 1"
    )
    .get();
  return row ? rowToSession(row) : null;
}
```

---

### 4. CLI Argument Parsing Pattern

**Decision**: Extend existing manual parsing in `index.ts`

**Rationale**:
- Current code already uses manual `for` loop parsing (no external parser)
- Low complexity - only 3 new cases to handle
- Consistent with existing codebase style

**Pattern**:
```typescript
// New parsing logic
let continueSession = false;
let session: string | undefined;
let yes = false;

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--continue") {
    continueSession = true;
  } else if (args[i] === "--session" && args[i + 1]) {
    session = args[i + 1];
    i++;
  } else if (args[i] === "--yes" || args[i] === "-y") {
    yes = true;
  }
}

// Validate mutual exclusivity
if (continueSession && session) {
  console.error("Error: cannot use both --continue and --session");
  process.exit(1);
}
```

---

### 5. Backward Compatibility

**Decision**: Preserve existing session lookup behavior (FR-010)

**Analysis**:
- Existing sessions with slug-style IDs (e.g., `my-session`) remain accessible via `--session`
- No transformation applied to user input
- `slug.ts` and `slugify()` remain unused for new sessions but available for backward compat

---

## Summary

All research items resolved with no external dependencies needed. Implementation follows existing patterns in the codebase.