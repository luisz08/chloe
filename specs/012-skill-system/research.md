# Research: Skill System

**Status**: Complete — no external unknowns

## Decisions

### File I/O

**Decision**: Use `Bun.file().text()` for reading skill content; `fs.promises.readdir` for directory listing.  
**Rationale**: Consistent with `packages/core/src/tools/read-file.ts` which already uses `Bun.file`. Native Bun APIs are idiomatic for this project.  
**Alternatives considered**: `node:fs` (works but non-idiomatic), custom abstraction (over-engineering).

### Directory Resolution

**Decision**: Global dir = `~/.chloe/skills/` resolved via `os.homedir()`. Project dir = `.chloe/skills/` relative to `process.cwd()`.  
**Rationale**: Matches existing config path resolution in `packages/core/src/config.ts` which uses `~/.chloe/`.  
**Alternatives considered**: Env var override (deferred to future enhancement).

### Precedence

**Decision**: Project-level skill overrides global when names collide. Last-write-wins if two files with same lowercase name exist in one directory (implementation: use a `Map<name, Skill>` populated global-first, then project).  
**Rationale**: Mirrors Claude Code behavior; local context is more specific.

### Case Sensitivity

**Decision**: Skill file names must be lowercase `[a-z0-9_-]+.md`. Lookup lowercases the command name from user input. Files with uppercase letters are ignored.  
**Rationale**: Avoids filesystem case-sensitivity issues across Linux (case-sensitive) and macOS (case-insensitive by default).

### Internal Command Extensibility

**Decision**: Internal commands are registered as a `Map<string, () => Promise<string>>` in `router.ts`. New commands added by extending this map.  
**Rationale**: Simple, no class hierarchy needed. Closed to extension from outside `@chloe/core` for now (future: exported registration API).

### Empty Skill Handling

**Decision**: Empty skill file → `{ kind: "error", message: "Skill 'foo' is empty" }`. No AI call made.  
**Rationale**: Explicit failure is better than sending an empty message to the AI.
