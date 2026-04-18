# Feature Specification: Skill System

**Feature Branch**: `012-skill-system`  
**Created**: 2026-04-18  
**Status**: Draft  

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invoke a Skill via Slash Command (Priority: P1)

A user types `/summarize Please summarize this conversation` in the CLI chat. Chloe loads `~/.chloe/skills/summarize.md` (or `.chloe/skills/summarize.md`), substitutes `$ARGUMENTS` with "Please summarize this conversation", and sends the result to the AI as the user's message.

**Why this priority**: Core functionality — the entire feature is useless without this working.

**Independent Test**: Create `~/.chloe/skills/greet.md` with content `Say hello to $ARGUMENTS`, run `chloe chat`, type `/greet world`. Verify the AI receives "Say hello to world" as the prompt.

**Acceptance Scenarios**:

1. **Given** a skill file `~/.chloe/skills/greet.md` containing `Say hello to $ARGUMENTS`, **When** user inputs `/greet world`, **Then** the AI receives "Say hello to world" as the user message.
2. **Given** a skill with no `$ARGUMENTS` placeholder, **When** user inputs `/deploy`, **Then** skill content is sent verbatim regardless of any trailing text.
3. **Given** a project-level skill `.chloe/skills/greet.md` and a global `~/.chloe/skills/greet.md`, **When** user inputs `/greet world`, **Then** the project-level skill takes precedence.

---

### User Story 2 - List Available Skills with /help (Priority: P2)

A user types `/help` and sees a list of built-in internal commands and all available skills (from global and project directories), with their source noted.

**Why this priority**: Discoverability — users need to know what skills exist without reading the filesystem.

**Independent Test**: Create two skill files (one global, one project-level), type `/help`, verify both are listed with their source (`global` or `project`).

**Acceptance Scenarios**:

1. **Given** skills exist in both `~/.chloe/skills/` and `.chloe/skills/`, **When** user types `/help`, **Then** output lists all skills grouped or annotated by source (global / project).
2. **Given** no skill files exist, **When** user types `/help`, **Then** output still shows internal commands (at minimum `/help`) with a note that no skills are defined.
3. **Given** the same skill name in both global and project directories, **When** user types `/help`, **Then** the skill is listed once, marked as overridden by project-level.

---

### User Story 3 - Unknown Command Error (Priority: P3)

A user types `/nonexistent`, and Chloe responds with a clear error message rather than passing the text to the AI.

**Why this priority**: UX correctness — silently passing `/foo` to the AI is confusing behavior.

**Independent Test**: Type `/nonexistent` with no matching skill file; verify the session shows an error and no AI call is made.

**Acceptance Scenarios**:

1. **Given** no skill named `foo` exists, **When** user inputs `/foo`, **Then** system returns `Unknown command: /foo` and does not invoke the AI.
2. **Given** an internal command exists (e.g. `/help`), **When** user inputs `/help`, **Then** it is handled as an internal command, not looked up as a skill file.

---

### User Story 4 - API Layer Slash Command Support (Priority: P4)

A client sends a message starting with `/skill-name args` to the HTTP API; chloe resolves and expands the skill the same way as the CLI.

**Why this priority**: Consistency — API and CLI should behave identically so integrations can use skills.

**Independent Test**: POST a message `/greet world` to the API with a valid session; verify the AI receives the expanded skill content.

**Acceptance Scenarios**:

1. **Given** a valid skill `greet`, **When** API receives message `/greet world`, **Then** AI is called with the expanded skill content.
2. **Given** an unknown command `/nonexistent`, **When** API receives this message, **Then** API returns an error response (not an AI response).

---

### Edge Cases

- What if the skill file is empty? → Return error: `Skill 'foo' is empty` and make no AI call.
- What if `$ARGUMENTS` appears multiple times? → All occurrences are replaced.
- What if the user types `/` with nothing after it? → Treat as unknown command, return error.
- What if the skill filename contains uppercase or spaces? → Skill names are matched case-insensitively; filenames with spaces are not supported (only `[a-z0-9_-].md` are valid skill files).
- What if `~/.chloe/skills/` or `.chloe/skills/` doesn't exist? → Silently skip that source; no error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST resolve skill files from `~/.chloe/skills/<name>.md` (global) and `.chloe/skills/<name>.md` (project-level), with project-level taking precedence when both exist.
- **FR-002**: System MUST intercept any user message starting with `/` and route it through the command/skill resolution pipeline before sending to the AI.
- **FR-003**: System MUST substitute all occurrences of `$ARGUMENTS` in the skill content with the text following `/skill-name` (trimmed). If no arguments provided, `$ARGUMENTS` is replaced with an empty string.
- **FR-004**: System MUST support internal commands that are not skill files. The first internal command MUST be `/help`.
- **FR-005**: `/help` MUST list all internal commands and all available skills (global + project), annotated by source. In CLI chat, the output is printed directly to stdout as formatted text (not sent to the AI). In API, it is returned as a plain-text response body.
- **FR-006**: System MUST return `Unknown command: /<name>` and make no AI call when neither an internal command nor a skill file matches.
- **FR-007**: Skill resolution MUST work identically in the CLI (`packages/cli`) and HTTP API (`packages/api`) layers, via shared logic in `packages/core`.
- **FR-008**: Only files with names matching `[a-z0-9_-]+\.md` (lowercase letters, digits, hyphens, underscores) are recognized as valid skills. Skill lookup is case-insensitive: `/Greet` resolves to `greet.md`. Files with uppercase letters in their names are ignored.

### Key Entities

- **Skill**: A Markdown file on disk. Key attributes: `name` (filename without `.md`), `content` (file text), `source` (`global` | `project`).
- **InternalCommand**: A hardcoded handler function. Key attributes: `name`, `handler`.
- **SkillLoader**: Core component responsible for discovering and loading skills from both directories.
- **CommandRouter**: Core component responsible for parsing `/`-prefixed input, dispatching to internal commands or skills, and returning errors for unknowns.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A skill file placed in `~/.chloe/skills/` is invocable via `/skill-name` within one session start (no restart required).
- **SC-002**: Project-level skills override global skills with the same name, verified by a test.
- **SC-003**: `/help` output lists all skill files present in both directories in under 100ms.
- **SC-004**: `/unknown-command` produces an error response in under 50ms with no AI API call made.
- **SC-005**: All existing CLI and API tests continue to pass (no regression).

## Assumptions

- Skill files are small text files (< 1MB); no streaming or chunked loading needed.
- The working directory at runtime determines the project-level skills path (`.chloe/skills/` relative to `process.cwd()`).
- Skills are loaded on each invocation (no caching), keeping implementation simple and ensuring file changes are picked up immediately.
- The CLI's `chat` subcommand is the primary consumer; `serve` subcommand (HTTP API) is secondary.
- No authentication or access control on skill files — OS filesystem permissions are sufficient.
- Skill names are case-insensitive on lookup but stored as lowercase filenames.
