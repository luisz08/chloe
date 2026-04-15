# Contract: CLI Session Command

**Feature**: 007-chat-session-refactor
**Contract Type**: Command Interface
**Date**: 2026-04-15

## Command Signature

```
chloe chat [--continue | --session <id>] [--yes | -y]
```

## Argument Specification

| Argument | Type | Description | Mutually Exclusive With |
|----------|------|-------------|------------------------|
| (default) | flag | No arguments → create new session | - |
| `--continue` | boolean flag | Resume most recent session by `updatedAt` | `--session` |
| `--session <id>` | string | Resume specific session by exact ID | `--continue` |
| `--yes` / `-y` | boolean flag | Auto-confirm tool calls | - |

## Behavior Matrix

| Command | Session ID | Session Name | Behavior on Error |
|---------|-----------|--------------|-------------------|
| `chloe chat` | Auto-generated: `YYYYMMDDHHmmss-xxxxxxx` | `"YYYY-MM-DD HH:mm"` | N/A (always succeeds) |
| `chloe chat --continue` | From `getLastSession()` | From existing session | `"No previous session found..."` exit 1 |
| `chloe chat --session <id>` | User-provided | From existing session | `"Session '<id>' not found..."` exit 1 |
| `chloe chat --continue --session <id>` | N/A | N/A | `"Error: cannot use both..."` exit 1 |

## Error Messages

| Condition | Error Message | Exit Code |
|-----------|---------------|-----------|
| `--continue` with no sessions | `"No previous session found. Use 'chloe chat' to start a new session."` | 1 |
| `--session <id>` not found | `"Session '<id>' not found. Use 'chloe chat' to start a new session."` | 1 |
| Both `--continue` and `--session` | `"Error: cannot use both --continue and --session"` | 1 |

## Exit Behavior

| Signal | Behavior |
|--------|----------|
| `Ctrl+C` (first) | Display hint, clear input |
| `Ctrl+C` (second) | Exit cleanly (code 0) |
| `exit` command | Exit cleanly (code 0) |
| Error condition | Exit with code 1 |

## Examples

```bash
# Start new session
chloe chat
# Output: Creates session with ID like 20260415143000-a1b2c3d

# Resume last session
chloe chat --continue
# Output: Loads most recently active session

# Resume specific session
chloe chat --session 20260415143000-a1b2c3d
# Output: Loads that specific session

# Auto-confirm tools
chloe chat --yes
chloe chat --continue --yes

# Error cases
chloe chat --continue --session foo
# Error: cannot use both --continue and --session
```

## Integration Points

- **StorageAdapter.getLastSession()**: Called by `--continue` flag
- **StorageAdapter.getSession(id)`: Called by `--session <id>` flag
- **generateSessionId()`: Called by default mode
- **formatSessionName()`: Called by default mode for new session name