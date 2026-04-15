# Feature Specification: Built-in Tools — bash, read_file, write_file

**Feature Branch**: `005-tools`
**Created**: 2026-04-14
**Status**: Shipped
**Input**: Add three built-in tools (`bash`, `read_file`, `write_file`) to the core package. These tools are the primary capability layer for the agent — designed to be sufficient for most tasks, minimising the need for future tool additions. Registered by default on every Agent instance. Sandboxed to the runtime working directory by default, with an opt-in allowlist config at `./.chloe/settings.json`.

---

## Design Principles

1. **Sufficient by default.** These three tools cover file I/O and command execution. Future features should extend via these tools, not add new ones, unless strictly necessary.
2. **Safe by default.** Operations are constrained to `process.cwd()` unless the user explicitly expands permissions in `./.chloe/settings.json`.
3. **Context-efficient.** Tool descriptions are tuned to guide the model toward precise usage. Output is always bounded; large outputs are truncated with a clear notice so the model can request subsets.
4. **Transparent.** The existing `confirmTool` human-in-the-loop mechanism already handles user confirmation. The sandbox layer is an additional, automatic pre-check.

---

## User Scenarios & Testing

### User Story 1 — Agent reads a file within the working directory (Priority: P1)

The agent needs to inspect a source file. It calls `read_file` and receives the content with line numbers.

**Why this priority**: Core capability. Most agent tasks start with reading a file.

**Independent Test**: Start chloe in a directory containing `README.md`. Ask "show me the README". Verify the agent calls `read_file` with path `README.md` and the content is returned.

**Acceptance Scenarios**:

1. **Given** a file exists within the working directory, **When** `read_file` is called with its relative path, **Then** the content is returned as numbered lines (format: `1\t<line>`).
2. **Given** a file with 500 lines and default `max_output_bytes = 32768`, **When** `read_file` is called without `offset`/`limit`, **Then** content up to the byte limit is returned, followed by `[output truncated: N bytes omitted, use offset/limit to read more]`.
3. **Given** a large file, **When** `read_file` is called with `offset: 100, limit: 50`, **Then** lines 100–149 are returned (1-indexed, inclusive).
4. **Given** a path that resolves outside the allowed paths (e.g. `../../etc/passwd`), **When** `read_file` is called, **Then** it returns an error: `Access denied: path is outside allowed directories`.
5. **Given** a path to a non-existent file, **When** `read_file` is called, **Then** it returns an error: `File not found: <path>`.

---

### User Story 2 — Agent writes or overwrites a file (Priority: P1)

The agent generates content and writes it to a file in the working directory.

**Why this priority**: Core capability paired with read. Write completes the file I/O loop.

**Independent Test**: Ask chloe to "create a file hello.txt with the text Hello". Verify `write_file` is called and `./hello.txt` is created with the correct content.

**Acceptance Scenarios**:

1. **Given** a writable path within allowed paths, **When** `write_file` is called with `path` and `content`, **Then** the file is written (created or overwritten) and the tool returns `Written N bytes to <path>`.
2. **Given** a path outside allowed paths, **When** `write_file` is called, **Then** it returns `Access denied: path is outside allowed directories`.
3. **Given** a path whose parent directory does not exist, **When** `write_file` is called, **Then** the parent directory (and any intermediate directories) is created automatically before writing.
4. **Given** a write succeeds, **When** the tool returns, **Then** the return message is short (one line) — no file content echoed back.

---

### User Story 3 — Agent runs a shell command within the working directory (Priority: P1)

The agent needs to run `ls`, `grep`, or similar to inspect the environment.

**Why this priority**: Core capability for agentic tasks. Unlocks directory listing, search, and lightweight data processing without adding more tools.

**Independent Test**: Ask "list all TypeScript files in src/". Verify the agent calls `bash` with a `find` or `ls` command, receives the output, and reports the list.

**Acceptance Scenarios**:

1. **Given** a command whose binary is in the allowlist (e.g. `ls -la`), **When** `bash` is called, **Then** it runs with `cwd = process.cwd()` and returns stdout + stderr combined.
2. **Given** stdout + stderr exceeds `max_output_bytes` (default 32768), **When** the command completes, **Then** output is truncated to the limit with `[output truncated: N bytes omitted]` appended.
3. **Given** a command binary not in the allowlist (e.g. `curl`), **When** `bash` is called, **Then** it returns `Command not allowed: curl is not in the allowed commands list`.
4. **Given** a command with an argument that resolves outside allowed paths (e.g. `cat /etc/passwd`), **When** `bash` is called, **Then** it returns `Access denied: argument /etc/passwd is outside allowed directories`.
5. **Given** a command that runs longer than `timeout_ms` (default 30 000 ms), **When** the timeout elapses, **Then** the process is killed and the tool returns `Command timed out after 30s`.
6. **Given** a non-zero exit code, **When** the command finishes, **Then** the output is still returned normally (exit code is included in the response as `[exit code: N]`).
7. **Given** a piped command like `grep -r "foo" src/ | wc -l`, **When** `bash` is called, **Then** both `grep` and `wc` are checked against the allowlist and the pipeline executes, returning the final output.
8. **Given** a piped command where any segment's binary is not in the allowlist (e.g. `ls | curl http://...`), **When** `bash` is called, **Then** it returns `Command not allowed: curl is not in the allowed commands list`.

---

### User Story 4 — Default allowlist restricts to working directory (Priority: P1)

Out of the box, with no `.chloe/settings.json`, the tools can only touch files inside `process.cwd()`.

**Why this priority**: Safety by default. Users must opt in to expanding permissions.

**Independent Test**: Run chloe in `/tmp/test-project`. Ask it to read `/etc/hosts`. Verify the tool rejects the request without any config file present.

**Acceptance Scenarios**:

1. **Given** no `.chloe/settings.json` exists in CWD, **When** any tool is used, **Then** `allowed_paths` defaults to `["./"]` (resolved to `process.cwd()`).
2. **Given** the default config, **When** `bash` is called with one of the 9 default commands (`ls`, `cat`, `grep`, `find`, `echo`, `pwd`, `wc`, `head`, `tail`), **Then** the command is permitted.
3. **Given** the default config, **When** `bash` is called with any other command (e.g. `git`, `node`, `rm`), **Then** it is rejected unless that command has been added to `allowed_commands` in settings.

---

### User Story 5 — User expands permissions via `.chloe/settings.json` (Priority: P2)

A user working on a project adds `git` to the allowed commands and grants read access to a shared data directory outside CWD.

**Why this priority**: Unlocks real-world use cases (e.g. git operations, reading reference data) without hardcoding exceptions.

**Independent Test**: Create `.chloe/settings.json` with `allowed_commands: ["jq"]` and `allowed_paths: ["./", "/data/shared"]`. Ask chloe to run `jq '.' data.json` and read `/data/shared/report.csv`. Both should succeed.

**Acceptance Scenarios**:

1. **Given** `allowed_commands` in settings includes `"jq"`, **When** `bash` is called with `jq '.' data.json`, **Then** it executes successfully (in addition to the 9 default commands which remain available).
2. **Given** `allowed_paths` in settings includes `"/data/shared"`, **When** `read_file` is called with a path under `/data/shared`, **Then** it succeeds.
3. **Given** settings lists `allowed_paths: ["./", "~/notes"]`, **When** the tool resolves paths, **Then** `~/` is expanded to the home directory before comparison.
4. **Given** `.chloe/settings.json` is malformed JSON, **When** the Agent starts, **Then** it logs a warning and falls back to default (CWD-only) settings — it does not crash.
5. **Given** `.chloe/settings.json` is present, **When** the Agent is constructed, **Then** settings are loaded once at construction time (not re-read per tool call).

---

### User Story 6 — Tools are registered by default on every Agent (Priority: P1)

No caller needs to manually wire up the three tools. They are available in every `createAgent()` call.

**Why this priority**: Reduces boilerplate and ensures consistent capability across CLI and API surfaces.

**Independent Test**: Construct an Agent using `createAgent(config)` without specifying any tools in config. Ask it to list files. Verify it can call `bash` with `ls`.

**Acceptance Scenarios**:

1. **Given** `createAgent(config)` is called without a `tools` array in config, **Then** `bash`, `read_file`, and `write_file` are available to the model.
2. **Given** `createAgent(config)` is called with an explicit `tools` array, **Then** only those tools are registered (caller has full control to opt out of defaults).
3. **Given** the default tools are registered, **When** `registry.list()` is called, **Then** all three tools appear with their names and input schemas.

---

### User Story 7 — EchoTool is removed (Priority: P1)

`EchoTool` was a placeholder for development. With three real tools in place it serves no purpose and adds noise to the tool registry.

**Why this priority**: Cleanup paired with this feature to keep the tool surface minimal.

**Acceptance Scenarios**:

1. **Given** the `tools/` module, **When** `createDefaultTools()` is called, **Then** `echo` is not registered and not exposed to the model.
2. **Given** the codebase, **When** built and linted, **Then** `echo.ts` and its test file are deleted with no remaining references.

---

## Data Model

### `.chloe/settings.json` (project-level, optional)

Located at `<cwd>/.chloe/settings.json`. Created by the user; never written by the agent.

```json
{
  "tools": {
    "allowed_paths": ["./", "~/notes"],
    "bash": {
      "allowed_commands": ["jq", "node"],
      "timeout_ms": 30000,
      "max_output_bytes": 32768
    },
    "read_file": {
      "max_output_bytes": 32768
    }
  }
}
```

All fields are optional. Defaults apply when absent.

`allowed_commands` is **additive**: entries listed here are added to the built-in default set (`ls`, `cat`, `grep`, `find`, `echo`, `pwd`, `wc`, `head`, `tail`). The defaults are always available and cannot be removed via config. Commands with mutating or network behaviour (e.g. `git`, `curl`, `rm`) are intentionally excluded from the defaults and must be explicitly listed here.

### Default values

| Field | Default |
|---|---|
| `tools.allowed_paths` | `["./"]` → resolved to `process.cwd()` |
| `tools.bash.allowed_commands` | `[]` (additive on top of built-in defaults: `ls cat grep find echo pwd wc head tail`) |
| `tools.bash.timeout_ms` | `30000` |
| `tools.bash.max_output_bytes` | `32768` |
| `tools.read_file.max_output_bytes` | `32768` |

`write_file` has no output size config (response is always a short status line).

---

## Tool Specifications

### `read_file`

**Purpose**: Read a file from the filesystem, optionally at a specific line range.

**Input schema**:
```json
{
  "type": "object",
  "properties": {
    "path":   { "type": "string",  "description": "Path to the file. Relative paths resolve from the working directory." },
    "offset": { "type": "integer", "description": "1-indexed line number to start reading from. Default: 1." },
    "limit":  { "type": "integer", "description": "Number of lines to read. Default: read to end (subject to max_output_bytes)." }
  },
  "required": ["path"]
}
```

**Description** (shown to model):
> Read a file and return its content with 1-indexed line numbers (`N\t<line>`). Use `offset` and `limit` to read a specific range of lines — always prefer a targeted range over reading the whole file. Output is capped at 32 KB; if truncated, a notice tells you how many bytes were omitted and how to fetch the next chunk.

**Output format**: `1\t<line1>\n2\t<line2>\n...` followed optionally by `\n[output truncated: N bytes omitted, use offset/limit to read more]`.

---

### `write_file`

**Purpose**: Write (create or overwrite) a file with the given content.

**Input schema**:
```json
{
  "type": "object",
  "properties": {
    "path":    { "type": "string", "description": "Path to write. Relative paths resolve from the working directory. Parent directories are created automatically if they do not exist." },
    "content": { "type": "string", "description": "Full file content to write." }
  },
  "required": ["path", "content"]
}
```

**Description** (shown to model):
> Write content to a file, creating it or overwriting it entirely. Parent directories are created automatically if they do not exist. Returns a short confirmation with the byte count written. Use `read_file` first if you need to do a partial update.

**Output format**: `Written N bytes to <path>` on success; error message on failure.

---

### `bash`

**Purpose**: Execute a single shell command in the working directory.

**Input schema**:
```json
{
  "type": "object",
  "properties": {
    "command": { "type": "string", "description": "Shell command to execute. The binary name must be in the allowed commands list." }
  },
  "required": ["command"]
}
```

**Description** (shown to model):
> Run a shell command in the working directory. Allowed commands: `ls`, `cat`, `grep`, `find`, `echo`, `pwd`, `wc`, `head`, `tail` (plus any user-configured additions). Output (stdout + stderr combined) is capped at 32 KB. Exit code is appended as `[exit code: N]` when non-zero. Prefer `read_file` for reading single files — use `bash` when you need shell features like globbing, piping, or counting.

**Execution model**:
- Executed via `bash -c "<command>"` to support shell features including pipes (`|`), redirects, and globbing.
- `cwd` of subprocess = `process.cwd()`.
- Environment: inherit from parent process.
- Shell injection risk is mitigated by the allowlist check: only commands whose first pipe-segment binary is in the allowlist are permitted.

---

## Implementation Notes

### Path validation

```
resolve(cwd, userPath) must start with one of the resolved allowed_paths
```

Symlinks are resolved before comparison (`realpath`-style) to prevent symlink escape. The `~` prefix in `allowed_paths` is expanded before storage.

### Bash argument scanning

The command string may contain pipes (`|`). Each pipe-segment is analysed independently:

1. Split the command string on `|` to get segments.
2. For each segment, shell-word-split to get tokens.
3. First token of each segment = binary name → check allowlist. All binaries in the pipeline must be in the allowlist.
4. Remaining tokens of each segment: for each token, test whether it looks like a path (starts with `/`, `~`, `./`, `../`, or resolves to an existing fs entry). If so, apply path validation.
5. Tokens that are not path-like (flags, integers, glob patterns like `*.ts`) are passed through as-is.

### Subprocess execution

Use Bun's `Bun.spawn` with:
- `cmd`: `["bash", "-c", command]`
- `cwd`: `process.cwd()`
- `stdout`: `"pipe"`, `stderr`: `"pipe"`
- Timeout via `AbortSignal` or manual kill after `timeout_ms`

### Module layout

```
packages/core/src/tools/
  types.ts          # Tool interface (existing)
  registry.ts       # ToolRegistry (existing)
  echo.ts           # EchoTool — REMOVED in this feature (replaced by real tools)
  settings.ts       # Load + parse .chloe/settings.json → ToolSettings
  sandbox.ts        # Path validation + bash argument scanning
  bash.ts           # BashTool
  read-file.ts      # ReadFileTool
  write-file.ts     # WriteFileTool
  index.ts          # createDefaultTools(settings) → Tool[]
```

### Agent integration

`createAgent()` calls `loadToolSettings(cwd)` and `createDefaultTools(settings)`, then registers them before the caller-supplied tools array (if any). If the caller passes `tools: [...]`, those are used instead.

---

## Out of Scope

- Shell features beyond pipes and basic redirects (e.g. subshells `$()`, here-docs, background jobs `&`) — these are not validated by the allowlist scanner and should be blocked by the user's own judgment via `confirmTool`.
- Interactive commands (anything requiring stdin prompts).
- Network-related tools (future feature).
- `.chloe/settings.json` written or modified by the agent itself.
