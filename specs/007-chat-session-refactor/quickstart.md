# Quickstart: Chat Session Command Refactor

**Feature**: 007-chat-session-refactor
**Date**: 2026-04-15

## Overview

This feature refactors the `chloe chat` command to provide three session modes:
1. **Default** - Create new session with auto-generated ID
2. **Continue** - Resume most recent session
3. **Specific** - Resume session by ID

## Quick Examples

### Start a New Session

```bash
chloe chat
```

Creates a new session with:
- **ID**: `20260415143000-a1b2c3d` (time-sorted format)
- **Name**: `"2026-04-15 14:30"` (timestamp format)

### Resume Last Session

```bash
chloe chat --continue
```

Loads the session with the highest `updatedAt` (most recently active).

### Resume Specific Session

```bash
# First, list sessions to find the ID
chloe sessions list

# Then resume by ID
chloe chat --session 20260415143000-a1b2c3d
```

### With Auto-Confirm

```bash
chloe chat --yes               # New session, auto-confirm tools
chloe chat --continue --yes    # Resume + auto-confirm
chloe chat --session <id> --yes  # Specific + auto-confirm
```

## What Changed

| Before | After |
|--------|-------|
| `chloe chat --session <name>` (required) | `chloe chat` (creates new session) |
| No continue option | `chloe chat --continue` (resume last) |
| Session name = ID | Session name = timestamp `"YYYY-MM-DD HH:mm"` |

## Key Files Modified

| File | Change |
|------|--------|
| `packages/core/src/session/id.ts` | New: time-sorted ID generator |
| `packages/core/src/session/name.ts` | New: timestamp name formatter |
| `packages/core/src/storage/adapter.ts` | Add `getLastSession()` to interface |
| `packages/core/src/storage/sqlite.ts` | Implement `getLastSession()` |
| `packages/cli/src/index.ts` | Update argument parsing |
| `packages/cli/src/commands/chat.ts` | Handle new options |

## Testing

```bash
# Run all tests
bun test

# Run specific tests
bun test packages/core/src/session/id.test.ts
bun test packages/core/src/storage/sqlite.test.ts
```

## Error Handling

| Error | Message |
|-------|---------|
| `--continue` with no sessions | `"No previous session found. Use 'chloe chat' to start a new session."` |
| Session not found | `"Session '<id>' not found. Use 'chloe chat' to start a new session."` |
| Conflicting flags | `"Error: cannot use both --continue and --session"` |