# Research: Chloe — Personal AI Agent

**Branch**: `001-chloe-personal-ai-agent` | **Date**: 2026-04-13

> Greenfield project — no existing codebase. All research covers external technology patterns and best practices.

---

## Decision 1: Bun Workspace Monorepo Structure

**Decision**: Three-package Bun workspace — `packages/core`, `packages/cli`, `packages/api`.

**Rationale**: Bun natively supports `"workspaces": ["packages/*"]` in the root `package.json`. Inter-package references use `"@chloe/core": "workspace:*"` in peer package.json files. Bun resolves these at link time without a separate build step. This cleanly enforces the Core-Library-First principle: `core` has zero entry-point dependencies; `cli` and `api` each depend only on `core`.

**Key patterns**:
- Root `package.json`: declares workspaces, dev dependencies (Biome, TypeScript), and workspace-level scripts (`bun run build`, `bun test`).
- Each package has its own `package.json` with `"private": true` (only `core` may be published later).
- Single root `tsconfig.json` with `"references"` to each package's `tsconfig.json` for incremental builds.
- Single root `biome.json` covering all packages.
- `bun.lockb` at root; each package does not have its own lockfile.

**Alternatives considered**:
- Single-package flat layout: rejected — mixes CLI/API concerns and makes Core-Library-First principle unenforceable by structure.
- Turborepo / nx orchestration: rejected — unnecessary complexity for three packages; Bun's built-in workspace support is sufficient.

---

## Decision 2: Anthropic SDK Streaming + ReAct Loop Pattern

**Decision**: Use `client.messages.stream()` from `@anthropic-ai/sdk` for streaming; implement ReAct loop as an async iterator over assistant turns.

**Rationale**: The Anthropic streaming API delivers both text deltas (for real-time display) and the final complete message (for tool-use detection). `stream.finalMessage()` awaits completion and returns the full `Message` object. `stop_reason === 'tool_use'` signals that the message contains `tool_use` content blocks.

**ReAct loop algorithm**:
```
loop:
  1. Call client.messages.stream({ model, tools, messages, system })
  2. Forward text_delta events to consumer (stdout or SSE)
  3. Await stream.finalMessage() → assistantMsg
  4. Append assistantMsg to message history
  5. If assistantMsg.stop_reason !== 'tool_use': break (final answer)
  6. For each tool_use block in assistantMsg.content:
     a. If HITL mode: prompt user for y/n confirmation
     b. If confirmed (or auto): execute tool via ToolRegistry
        - On success: observation = { type: 'tool_result', tool_use_id, content: result }
        - On denial: observation = { type: 'tool_result', tool_use_id, content: 'Tool execution denied by user.' }
        - On error: observation = { type: 'tool_result', tool_use_id, is_error: true, content: errorMsg }
     c. Append tool_results message to history
  7. goto loop
```

**Key SDK types used**:
- `Anthropic.MessageStreamEvent` — streaming events
- `Anthropic.Message` — final message from `finalMessage()`
- `Anthropic.Tool` — tool definition shape (maps to our `Tool` interface)
- `Anthropic.ToolUseBlock` — tool_use content block
- `Anthropic.ToolResultBlockParam` — tool result to inject back

**Alternatives considered**:
- Non-streaming `client.messages.create()`: rejected — violates NFR-006 (streaming always) and degrades UX.
- Manual SSE parsing: rejected — SDK handles reconnection and parsing.

---

## Decision 3: bun:sqlite Storage Pattern

**Decision**: Use `bun:sqlite` (built-in, no extra dependency) with prepared statements and a two-table schema: `sessions` and `messages`.

**Rationale**: `bun:sqlite` is zero-dependency, ships with Bun, and has a synchronous API that's simpler to wrap behind the async `StorageAdapter` interface than a promise-based driver. The synchronous calls complete in microseconds for local SQLite — no meaningful latency.

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS sessions (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
  content    TEXT NOT NULL,   -- JSON-serialized MessageParam for Anthropic
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
```

**Key bun:sqlite patterns**:
```typescript
import { Database } from 'bun:sqlite';
const db = new Database(path, { create: true });
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA journal_mode = WAL');
const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
const row = stmt.get<SessionRow>(id);  // typed via generic
const rows = stmt.all<SessionRow>();
stmt.run(params);
```

**Alternatives considered**:
- `better-sqlite3`: rejected — external dependency, no advantage over built-in.
- `drizzle-orm` or `prisma`: rejected — ORM overhead not warranted for two tables; DRY is better served by a thin DAO than a full ORM.

---

## Decision 4: Bun HTTP Server + SSE Streaming Pattern

**Decision**: Use `Bun.serve()` with `ReadableStream` for SSE responses; route matching via URL parsing (no router framework).

**Rationale**: Bun's built-in HTTP server is sufficient for a personal-use API with three routes. Adding Express or Hono is unnecessary complexity. SSE is implemented as a `ReadableStream` returned with `Content-Type: text/event-stream`.

**SSE streaming pattern**:
```typescript
Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    // Route: POST /sessions/:id/messages
    if (req.method === 'POST' && url.pathname.match(/^\/sessions\/[^/]+\/messages$/)) {
      const sessionId = url.pathname.split('/')[2];
      const { content } = await req.json() as { content: string };

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            await agent.run(sessionId, content, {
              onToken: (text) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`));
              },
            });
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    // ... other routes
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  },
});
```

**Alternatives considered**:
- Hono: reasonable choice but adds a dependency; Bun's native routing is sufficient for 3 routes.
- WebSocket: deferred per spec assumption; SSE covers the streaming requirement.

---

## Decision 5: Biome + TypeScript Strict Configuration

**Decision**: Single root `biome.json` + root `tsconfig.json` with project references to each package.

**TypeScript configuration** (root `tsconfig.json`):
```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noFallthroughCasesInSwitch": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun-types"],
    "skipLibCheck": true
  }
}
```

**Biome configuration** (root `biome.json`):
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      },
      "suspicious": {
        "noExplicitAny": "error",
        "noArrayIndexKey": "off"
      },
      "style": {
        "noNonNullAssertion": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "all"
    }
  }
}
```

**Key insight**: `moduleResolution: "bundler"` is required for Bun workspaces to resolve `@chloe/core` imports without building first. This is distinct from Node's `"node16"` or `"nodenext"` resolution.

**Alternatives considered**:
- ESLint + Prettier: rejected per spec (Biome chosen in brainstorm for speed and single-tool simplicity).
- Per-package biome configs: rejected — single root config enforces consistent style across all packages with less configuration overhead.

---

## Unresolved Items

None. All five research topics fully resolved.
