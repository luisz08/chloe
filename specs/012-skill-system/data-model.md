# Data Model: Skill System

## Types

```typescript
// packages/core/src/skills/types.ts

type SkillSource = "global" | "project";

interface Skill {
  name: string;        // lowercase, no .md extension
  content: string;     // raw markdown file content
  source: SkillSource;
}

type CommandResult =
  | { kind: "skill"; expandedContent: string }
  | { kind: "internal"; output: string }
  | { kind: "error"; message: string }
  | { kind: "passthrough" };
```

## Entities

### Skill
Represents a single skill file loaded from disk.
- `name`: derived from filename (strip `.md`, lowercase)
- `content`: verbatim file text
- `source`: `"global"` for `~/.chloe/skills/`, `"project"` for `.chloe/skills/`

### CommandResult
Discriminated union returned by `routeCommand()`:
- `passthrough`: input didn't start with `/` — caller proceeds normally
- `skill`: input matched a skill file — `expandedContent` has `$ARGUMENTS` substituted
- `internal`: input matched a built-in command — `output` is display text
- `error`: unknown command or empty skill — `message` describes the problem

## Filesystem Layout (runtime)

```
~/.chloe/skills/            ← global skills dir (may not exist)
  summarize.md
  deploy.md

<cwd>/.chloe/skills/        ← project skills dir (may not exist)
  deploy.md                 ← overrides global deploy.md
```

## Validation Rules

- Valid skill filename regex: `/^[a-z0-9_-]+\.md$/`
- Files not matching this pattern are silently ignored
- Missing directories are silently skipped (not an error)
- Empty content (after trim) → error result
