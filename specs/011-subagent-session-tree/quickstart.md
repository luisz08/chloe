# Quickstart: Subagent Session Tree

**Feature**: 011-subagent-session-tree | **Date**: 2026-04-17

## Implementation Sequence

### 1. Storage Layer (packages/core/src/storage/)

**Order**: adapter.ts → sqlite.ts → tests

```
1. Extend StorageAdapter interface (adapter.ts)
   - createChildSession(parentId, type, title)
   - getChildSessions(parentId)
   - getSessionTree(rootId, maxDepth)
   - listSessionsByType(type)

2. Extend Session type (session/types.ts)
   - parentId: string | null
   - subagentType: string | null

3. Implement in SQLiteStorageAdapter (sqlite.ts)
   - DDL: ALTER TABLE ADD COLUMN parent_id, subagent_type
   - DDL: CREATE INDEX idx_sessions_parent_id
   - Implement createChildSession (ID generation)
   - Implement getChildSessions (SELECT WHERE parent_id)
   - Implement getSessionTree (recursive CTE)
   - Implement listSessionsByType (SELECT WHERE subagent_type)

4. Add unit tests (storage/sqlite.test.ts)
   - Test child session creation
   - Test tree retrieval
   - Test orphaned children handling
```

---

### 2. Tool Context Passing (packages/core/src/tools/)

**Order**: types.ts → subagent.ts → tests

```
1. Extend Tool interface (tools/types.ts)
   - execute(input: unknown, context?: ToolContext): Promise<string>
   - Define ToolContext { sessionId, storage, client, modelConfig }

2. Modify subagent.ts
   - Accept ToolContext parameter in execute
   - Create child session before API call
   - Persist request as user message
   - Call API (existing logic)
   - Persist response as assistant message with metadata
   - Return text (unchanged behavior)

3. Add tests (tools/subagent.test.ts)
   - Test session creation on subagent call
   - Test metadata persistence
   - Test error handling (session with error metadata)
```

---

### 3. Agent Integration (packages/core/src/agent/)

**Order**: agent.ts → loop.ts

```
1. Modify Agent class (agent/agent.ts)
   - Pass sessionId to ToolRegistry.execute
   - Create ToolContext with sessionId, storage, client, modelConfig

2. Modify runLoop (agent/loop.ts)
   - Pass context to tool execute calls
```

---

### 4. CLI Commands (packages/cli/src/commands/)

**Order**: sessions.ts

```
1. Extend sessions command (commands/sessions.ts)
   - Add --tree flag: display hierarchical tree
   - Add --children flag: list direct children
   - Add --type flag: filter by subagent type

2. Tree display format:
   session-abc (root)
     ├── session-abc-vision_analyze-1712345678 (vision_analyze)
     ├── session-abc-fast_query-1712345679 (fast_query)
     └── session-abc-deep_reasoning-1712345680 (deep_reasoning)
```

---

### 5. API Routes (packages/api/src/)

**Order**: router.ts → handlers/sessions.ts

```
1. Add routes (router.ts)
   - GET /sessions/:id/children → handleGetChildren
   - GET /sessions/:id/tree → handleGetTree

2. Add handlers (handlers/sessions.ts)
   - handleGetChildren: call storage.getChildSessions
   - handleGetTree: call storage.getSessionTree
```

---

## Key Files to Modify

| File | Change Type | Priority |
|------|-------------|----------|
| `packages/core/src/storage/adapter.ts` | Interface extension | P1 |
| `packages/core/src/session/types.ts` | Type extension | P1 |
| `packages/core/src/storage/sqlite.ts` | Implementation + DDL | P1 |
| `packages/core/src/tools/types.ts` | Interface extension | P2 |
| `packages/core/src/tools/subagent.ts` | Logic modification | P2 |
| `packages/core/src/agent/agent.ts` | Context passing | P2 |
| `packages/cli/src/commands/sessions.ts` | CLI flags | P3 |
| `packages/api/src/router.ts` | Routes | P3 |
| `packages/api/src/handlers/sessions.ts` | Handlers | P3 |

---

## Testing Checklist

- [ ] Child session creation (all 3 subagent types)
- [ ] Session tree retrieval (depth 1, 3, 10)
- [ ] Orphaned children query (parent deleted)
- [ ] Error persistence (API call fails)
- [ ] Metadata accuracy (tokens, model, elapsed)
- [ ] CLI tree display formatting
- [ ] API endpoints response structure
- [ ] Backward compatibility (existing sessions work)