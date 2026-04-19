# Reviewers Guide: Skill System (012)

## What This PR Does

Adds a slash-command skill system to Chloe. Users place Markdown files in `~/.chloe/skills/` or `.chloe/skills/` and invoke them with `/skill-name [args]`. The skill content (with `$ARGUMENTS` substituted) replaces the user message sent to the AI. Internal commands (`/help`) are handled without AI calls. Unknown commands return an error.

## Key Files to Review

| File | What to check |
|------|--------------|
| `packages/core/src/skills/types.ts` | `CommandResult` discriminated union — all variants present? |
| `packages/core/src/skills/loader.ts` | Directory resolution, precedence logic, regex validation, `$ARGUMENTS` substitution |
| `packages/core/src/skills/router.ts` | Internal command check before skill lookup; error paths |
| `packages/core/src/skills/loader.test.ts` | Coverage of precedence, missing dirs, invalid filenames, empty files |
| `packages/core/src/skills/router.test.ts` | Coverage of all `CommandResult` variants, `/help` output format |
| `packages/cli/src/ui/App.tsx` | `handleSubmit` — all 4 `CommandResult` variants handled; no AI call on error/internal |
| `packages/api/src/handlers/messages.ts` | Same 4 variants handled; correct HTTP status codes |

## Constitution Checklist

- [ ] All business logic in `packages/core` (not in CLI or API)
- [ ] No `any` types, no `as` casts
- [ ] `biome check --error-on-warnings` passes
- [ ] `tsc --noEmit` passes
- [ ] `bun test` all pass
- [ ] New skill dirs missing → silently skipped (no crash)
- [ ] `/nonexistent` → error, no AI call
- [ ] Project-level skill overrides global same-name skill

## Spec Acceptance Scenarios to Verify

- US1: `/greet world` with `greet.md` containing `Say hello to $ARGUMENTS` → AI receives "Say hello to world"
- US1: Project `.chloe/skills/deploy.md` takes precedence over `~/.chloe/skills/deploy.md`
- US2: `/help` lists both global and project skills with source annotation
- US3: `/nonexistent` → "Unknown command: /nonexistent" displayed, no AI request
- US4: API `POST` with `/greet world` → AI receives expanded content
