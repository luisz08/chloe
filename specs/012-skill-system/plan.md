# Implementation Plan: Skill System

**Branch**: `012-skill-system` | **Date**: 2026-04-18 | **Spec**: `specs/012-skill-system/spec.md`

## Summary

Add a slash-command skill system to Chloe. Users place Markdown files in `~/.chloe/skills/` (global) or `.chloe/skills/` (project-level). Typing `/skill-name [args]` in chat or sending it via the API loads the file, substitutes `$ARGUMENTS`, and sends the expanded content to the AI. Internal commands (`/help`) are handled without AI calls. Unknown commands return an error. All resolution logic lives in `@chloe/core`.

## Technical Context

**Language/Version**: TypeScript 5.x / Bun ≥ 1.1  
**Primary Dependencies**: `@chloe/core` (shared skill logic), Bun native `fs` (`Bun.file`, `readdir`)  
**Storage**: Filesystem (no DB changes)  
**Testing**: `bun test`  
**Target Platform**: Linux / macOS (Bun runtime)  
**Project Type**: Monorepo library + CLI + API  
**Performance Goals**: Skill load < 50ms; `/help` listing < 100ms  
**Constraints**: No new external npm dependencies; no caching (load on every invocation)  
**Scale/Scope**: Single user; files < 1MB each

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Core-Library-First | PASS | All skill/command logic in `packages/core/src/skills/` |
| II. Strict TypeScript | PASS | No `any`, no `as` casts; strict types throughout |
| III. Biome | PASS | Must run `biome check` before commit |
| IV. DRY | PASS | One `CommandRouter` shared by CLI and API |
| V. Plugin Contracts | PASS | `SkillLoader` interface defined before implementation |
| VI. Streaming Always | PASS | Skill expansion happens before AI call; streaming unaffected |
| VII. Unit Tests | PASS | `SkillLoader` and `CommandRouter` covered by unit tests |
| VIII. Human-in-the-Loop | N/A | Skills do not add tools; existing tool confirmation unchanged |

## Project Structure

### Documentation (this feature)

```text
specs/012-skill-system/
├── spec.md
├── plan.md              ← this file
├── research.md
├── data-model.md
└── tasks.md
```

### Source Code

```text
packages/core/src/skills/
├── types.ts             ← Skill, InternalCommand, CommandResult types
├── loader.ts            ← SkillLoader: discovers + loads skill files
├── router.ts            ← CommandRouter: parses /commands, dispatches
└── index.ts             ← public exports

packages/core/src/index.ts          ← add skills re-export

packages/cli/src/commands/chat.ts   ← instantiate CommandRouter, pass to App
packages/cli/src/ui/App.tsx         ← intercept /commands in handleSubmit

packages/api/src/handlers/messages.ts  ← intercept /commands before agent.run()
```

### Test Files

```text
packages/core/src/skills/loader.test.ts
packages/core/src/skills/router.test.ts
```

## Phase 0: Research

No external unknowns. All decisions below are resolved from the constitution and codebase.

**Decision**: Use Bun's `fs.promises.readdir` + `Bun.file().text()` for skill file I/O.  
**Rationale**: Already used in other parts of the codebase (`read-file.ts`); no new APIs.  
**Alternatives considered**: `node:fs` (works but Bun-native is idiomatic here).

**Decision**: `SkillLoader` is a plain object/function, not a class.  
**Rationale**: Stateless; no instantiation needed. Matches existing tool patterns.

**Decision**: CLI intercept in `App.tsx` `handleSubmit`, not in `chat.ts`.  
**Rationale**: `handleSubmit` is the single submit path; intercept here avoids duplicating routing logic for future non-TUI modes.

**Decision**: API intercept in `handlePostMessage` before `agent.run()`.  
**Rationale**: Cleanest boundary; keeps the handler self-contained.

## Phase 1: Data Model & Contracts

### Data Model (`data-model.md`)

```typescript
// types.ts

type SkillSource = "global" | "project";

interface Skill {
  name: string;        // filename without .md, lowercase
  content: string;     // raw file content
  source: SkillSource;
}

// What CommandRouter returns
type CommandResult =
  | { kind: "skill"; expandedContent: string }
  | { kind: "internal"; output: string }    // /help, future internal cmds
  | { kind: "error"; message: string }      // unknown command, empty skill
  | { kind: "passthrough" };                // input didn't start with /
```

### Contracts

**SkillLoader** (core, pure functions):

```typescript
// loader.ts
function loadSkills(globalDir: string, projectDir: string): Promise<Skill[]>
// Returns all valid skills; project-level overrides global same-name.
// Silently skips missing directories.
// Only files matching /^[a-z0-9_-]+\.md$/ are included.

function expandArguments(content: string, args: string): string
// Replaces all $ARGUMENTS in content with args (trimmed).
```

**CommandRouter** (core):

```typescript
// router.ts
interface RouterOptions {
  globalSkillsDir: string;   // e.g. ~/.chloe/skills
  projectSkillsDir: string;  // e.g. .chloe/skills (process.cwd())
}

async function routeCommand(input: string, opts: RouterOptions): Promise<CommandResult>
// If input doesn't start with /, returns { kind: "passthrough" }.
// Parses /name [args], checks internal commands, then skills.
// Returns appropriate CommandResult variant.
```

**CLI integration contract** (`App.tsx` `handleSubmit`):

```typescript
// Before agent.run(), call routeCommand(text, opts).
// kind==="passthrough" → proceed as normal (call agent.run())
// kind==="skill"       → call agent.run() with expandedContent instead of text
// kind==="internal"    → display output message, skip agent.run()
// kind==="error"       → display error message, skip agent.run()
```

**API integration contract** (`handlePostMessage`):

```typescript
// Before agent.run(), call routeCommand(content, opts).
// kind==="passthrough" → proceed as normal
// kind==="skill"       → call agent.run() with expandedContent
// kind==="internal"    → return 200 text/plain with output
// kind==="error"       → return 400 JSON { error: message }
```

### `/help` Output Format

CLI (stdout, plain text):
```
Available commands:
  /help    Show this help message

Skills (global: ~/.chloe/skills/):
  /summarize

Skills (project: .chloe/skills/):
  /deploy   [overrides global]

No skills defined.   ← shown when both dirs empty
```

API (200 text/plain, same content).

## Complexity Tracking

No constitution violations.
