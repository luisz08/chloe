# Data Model: Context Compression (014)

## Entities

### Session (modified)

Existing entity. Adding the `summary` field.

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| id | TEXT | No | Primary key |
| name | TEXT | No | Human-readable session name |
| createdAt | number | No | Unix ms timestamp |
| updatedAt | number | No | Unix ms timestamp |
| parentId | string | Yes | Parent session ID (subagent sessions) |
| subagentType | string | Yes | Subagent type identifier |
| **summary** | **string** | **Yes** | **Compressed history summary text. NULL if session has never been compressed.** |

**State transitions for `summary`:**
- `null` → string: first compression event
- string → string: re-compression (summary incorporated into new summary)
- Never set back to null once compressed

---

### CompressionInfo (new — in-memory only)

Passed to `onContextCompressed` callback. Not persisted.

| Field | Type | Description |
|-------|------|-------------|
| compressedCount | number | Number of messages summarized |
| keptCount | number | Number of recent messages kept verbatim |

---

### ContextCompressionConfig (new — config)

Part of `ChloeConfig`. Parsed from TOML `[context_compression]` section.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| threshold | number | 0.75 | Fraction of context window that triggers compression |
| keepRecentCount | number | 20 | Number of most-recent messages to preserve verbatim |

---

## Schema Changes

### sessions table (SQLite)

```sql
-- New column added via migration in SQLiteStorageAdapter constructor
ALTER TABLE sessions ADD COLUMN summary TEXT DEFAULT NULL;
```

Migration guard pattern (matches existing pattern for `parent_id` and `subagent_type`):
```typescript
try {
  this.db.run("ALTER TABLE sessions ADD COLUMN summary TEXT DEFAULT NULL");
} catch {
  // Column already exists, ignore
}
```

---

## Interface Changes

### StorageAdapter (packages/core/src/storage/adapter.ts)

Two new methods added:

```typescript
getSessionSummary(id: string): Promise<string | null>;
setSessionSummary(id: string, summary: string): Promise<void>;
```

### AgentCallbacks (packages/core/src/agent/types.ts)

New optional callback:

```typescript
onContextCompressed?: (info: CompressionInfo) => void;
```

### ChloeConfig (packages/core/src/config.ts)

New nested config section:

```typescript
export interface ContextCompressionConfig {
  threshold: number;       // default 0.75
  keepRecentCount: number; // default 20
}

export interface ChloeConfig {
  provider: ProviderConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
  contextCompression: ContextCompressionConfig; // new
}
```

### MessageRole (packages/cli/src/ui/types.ts)

Extended:
```typescript
export type MessageRole = "user" | "assistant" | "tool" | "system";
```

---

## Validation Rules

- `threshold` must be between 0.0 and 1.0 exclusive; values outside this range revert to default (0.75)
- `keepRecentCount` must be ≥ 1; values below 1 revert to default (20)
- `summary` text has no enforced size limit; the model is responsible for keeping it concise
- If the stored summary plus recent messages exceeds the token threshold, an error is raised (not silently handled)
