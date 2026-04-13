# API Contract: Chloe REST/SSE Service

**Branch**: `001-chloe-personal-ai-agent` | **Date**: 2026-04-13

Base URL: `http://localhost:<port>` (default port: 3000, overridable via `--port` or `PORT` env var)

---

## Endpoints

### POST /sessions/:id/messages

Submit a user message to a session and receive a streaming assistant response.

**Path parameters**:
- `id` — Session ID (URL-safe slug). If the session does not exist, it is created automatically.

**Request**:
```
Content-Type: application/json

{
  "content": string  // required, non-empty
}
```

**Response (success)**:
```
HTTP 200
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"token","text":"Hello"}
data: {"type":"token","text":", how"}
data: {"type":"token","text":" can I help?"}
data: [DONE]
```

Event types:
- `{"type":"token","text":"..."}` — a text delta streamed from the model
- `{"type":"tool_call","name":"...","input":{...}}` — agent is about to call a tool (informational; tool was already confirmed server-side in API mode)
- `{"type":"tool_result","name":"...","output":"..."}` — result of a tool execution
- `[DONE]` — stream complete; connection will close

**Response (error)**:
```
HTTP 400  { "error": "content is required" }
HTTP 500  { "error": "Internal server error" }
```

---

### GET /sessions

List all sessions.

**Response (success)**:
```
HTTP 200
Content-Type: application/json

[
  {
    "id": "my-project",
    "name": "My Project",
    "createdAt": 1744538400000,
    "updatedAt": 1744538460000,
    "messageCount": 12
  }
]
```

Returns an empty array `[]` if no sessions exist.

---

### DELETE /sessions/:id

Delete a session and all its messages.

**Path parameters**:
- `id` — Session ID to delete.

**Response (success)**:
```
HTTP 200
Content-Type: application/json

{ "deleted": true }
```

**Response (error)**:
```
HTTP 404  { "error": "Session not found" }
```

---

## Error Response Shape

All error responses use:
```
Content-Type: application/json

{ "error": "<human-readable message>" }
```

HTTP status codes:
| Code | When |
|------|------|
| 400 | Invalid request body or parameters |
| 404 | Session not found (DELETE only) |
| 405 | Method not allowed |
| 500 | Unhandled internal error |

---

## CLI Contract

### `chloe chat --session <name> [--yes]`

Starts an interactive REPL session.

- `--session <name>`: required. Session name (human-readable; converted to slug ID internally).
- `--yes`: optional. Auto-confirm all tool calls without prompting.

**Interactive behavior**:
```
[chloe] session: my-project
> Hello
▌ (streaming tokens appear here...)
Hello! How can I help you today?

> exit
```

Human-in-the-loop prompt (when agent calls a tool):
```
[tool] echo
  input: { "message": "hello world" }
Confirm? [y/N]: 
```

---

### `chloe serve [--port <n>]`

Starts the REST/SSE API service.

- `--port <n>`: optional, default 3000. Also reads `PORT` env var (CLI flag takes precedence).

Output on start:
```
Chloe API listening on http://localhost:3000
```

---

### `chloe sessions list`

```
ID              NAME            CREATED              LAST ACTIVE
my-project      My Project      2026-04-13 10:00     2026-04-13 10:05
work-tasks      Work Tasks      2026-04-12 09:00     2026-04-12 09:30
```

---

### `chloe sessions delete <id>`

```
Deleted session: my-project
```

Error:
```
Error: session 'not-found' does not exist
exit code 1
```
