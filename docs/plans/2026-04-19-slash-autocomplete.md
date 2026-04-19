# Slash Command Autocomplete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the user types `/` in the CLI chat input, show an inline autocomplete palette listing internal commands and skills, sorted by recently-used then alphabetically, with Tab to fill and Enter to submit immediately.

**Architecture:** Add a `description` field to `Skill`, a `recents.ts` module for MRU persistence at `~/.chloe/skill-recents.json`, and a `CommandPalette` Ink component that renders above `InputArea`. `App` owns the skill cache (loaded on mount), the filtered/sorted palette items, and the selected index; `InputArea` handles Tab; `ChatView` yields arrow keys when the palette is active.

**Tech Stack:** TypeScript · Bun · Ink (React for CLI) · `bun:test` · Biome

---

### Task 1: Add `description` to `Skill` type and extract it in loader

**Files:**
- Modify: `packages/core/src/skills/types.ts`
- Modify: `packages/core/src/skills/loader.ts`
- Modify: `packages/core/src/skills/loader.test.ts`

**Step 1: Write failing tests for description extraction**

Add to `packages/core/src/skills/loader.test.ts`:

```ts
describe("loadSkills — description extraction", () => {
  let globalDir: string;
  let projectDir: string;

  beforeEach(() => {
    globalDir = makeTmpDir();
    projectDir = makeTmpDir();
  });
  afterEach(() => {
    rmSync(globalDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("extracts description from frontmatter", async () => {
    writeFileSync(
      join(globalDir, "greet.md"),
      "---\ndescription: Say hello\n---\nHello $ARGUMENTS",
    );
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills[0]?.description).toBe("Say hello");
  });

  it("falls back to first non-empty non-separator line when no frontmatter", async () => {
    writeFileSync(join(globalDir, "deploy.md"), "Deploy the app now");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills[0]?.description).toBe("Deploy the app now");
  });

  it("skips --- separator lines when no frontmatter description field", async () => {
    writeFileSync(join(globalDir, "deploy.md"), "---\ntitle: foo\n---\nDeploy now");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills[0]?.description).toBe("Deploy now");
  });

  it("returns (no description) for empty skill file", async () => {
    writeFileSync(join(globalDir, "empty.md"), "   ");
    const skills = await loadSkills(globalDir, projectDir);
    expect(skills[0]?.description).toBe("(no description)");
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test packages/core/src/skills/loader.test.ts
```

Expected: FAIL — `description` is undefined.

**Step 3: Update `types.ts`**

```ts
export interface Skill {
  name: string;
  content: string;
  source: SkillSource;
  description: string;
}
```

**Step 4: Update `loader.ts` — add `extractDescription`**

```ts
function extractDescription(content: string): string {
  const lines = content.split("\n");
  // Check for frontmatter block: starts with ---
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === "---") break;
      const match = lines[i]?.match(/^description:\s*(.+)$/);
      if (match) return match[1]?.trim() ?? "(no description)";
    }
    // No description field — find first non-empty line after closing ---
    let pastFrontmatter = false;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]?.trim() === "---") { pastFrontmatter = true; continue; }
      if (pastFrontmatter && lines[i]?.trim()) return lines[i]!.trim();
    }
    return "(no description)";
  }
  // No frontmatter — first non-empty line
  for (const line of lines) {
    if (line.trim()) return line.trim();
  }
  return "(no description)";
}
```

In `loadSkillsFromDir`, update the skill construction:
```ts
skills.set(name, { name, content, source, description: extractDescription(content) });
```

**Step 5: Run tests**

```bash
bun test packages/core/src/skills/loader.test.ts
```

Expected: all PASS.

**Step 6: Type-check**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

Expected: no errors.

**Step 7: Commit**

```bash
git add packages/core/src/skills/types.ts packages/core/src/skills/loader.ts packages/core/src/skills/loader.test.ts
git commit -m "feat: add description field to Skill type with frontmatter extraction"
```

---

### Task 2: Add `reload-skills` internal command to router

**Files:**
- Modify: `packages/core/src/skills/types.ts`
- Modify: `packages/core/src/skills/router.ts`
- Modify: `packages/core/src/skills/router.test.ts`

**Step 1: Write failing test**

Add to `packages/core/src/skills/router.test.ts`:

```ts
describe("routeCommand — reload-skills", () => {
  it("returns reload-skills kind for /reload-skills", async () => {
    const result = await routeCommand("/reload-skills", {
      globalSkillsDir: "",
      projectSkillsDir: "",
    });
    expect(result.kind).toBe("reload-skills");
  });
});
```

**Step 2: Run test to confirm failure**

```bash
bun test packages/core/src/skills/router.test.ts
```

Expected: FAIL — kind is `"error"`, not `"reload-skills"`.

**Step 3: Add `reload-skills` to `CommandResult` union in `types.ts`**

```ts
export type CommandResult =
  | { kind: "skill"; expandedContent: string }
  | { kind: "internal"; output: string }
  | { kind: "reload-skills" }
  | { kind: "error"; message: string }
  | { kind: "passthrough" };
```

**Step 4: Add `"reload-skills"` to `INTERNAL_COMMANDS` in `router.ts`**

```ts
const INTERNAL_COMMANDS = new Set(["help", "reload-skills"]);
```

Handle it before the generic internal-command branch:

```ts
if (name === "reload-skills") {
  return { kind: "reload-skills" };
}

if (INTERNAL_COMMANDS.has(name)) {
  return { kind: "internal", output: await buildHelpOutput(opts) };
}
```

**Step 5: Run tests**

```bash
bun test packages/core/src/skills/router.test.ts
```

Expected: all PASS.

**Step 6: Type-check and commit**

```bash
bunx tsc --noEmit -p tsconfig.check.json
git add packages/core/src/skills/types.ts packages/core/src/skills/router.ts packages/core/src/skills/router.test.ts
git commit -m "feat: add reload-skills internal command"
```

---

### Task 3: Create `recents.ts` — MRU list persisted to disk

**Files:**
- Create: `packages/core/src/skills/recents.ts`
- Create: `packages/core/src/skills/recents.test.ts`
- Modify: `packages/core/src/skills/index.ts`

**Step 1: Write failing tests**

Create `packages/core/src/skills/recents.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addRecent, loadRecents, saveRecents } from "./recents.js";

describe("addRecent", () => {
  it("prepends a new name", () => {
    expect(addRecent(["b", "c"], "a")).toEqual(["a", "b", "c"]);
  });

  it("moves an existing name to front", () => {
    expect(addRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("truncates to limit", () => {
    const existing = Array.from({ length: 20 }, (_, i) => `s${i}`);
    const result = addRecent(existing, "new", 20);
    expect(result).toHaveLength(20);
    expect(result[0]).toBe("new");
  });
});

describe("loadRecents / saveRecents", () => {
  let filePath: string;

  beforeEach(() => {
    filePath = join(tmpdir(), `recents-${Math.random().toString(36).slice(2)}.json`);
  });

  afterEach(() => {
    rmSync(filePath, { force: true });
  });

  it("returns [] when file does not exist", () => {
    expect(loadRecents(filePath)).toEqual([]);
  });

  it("returns [] when file contains invalid JSON", () => {
    writeFileSync(filePath, "not json");
    expect(loadRecents(filePath)).toEqual([]);
  });

  it("round-trips save and load", () => {
    saveRecents(filePath, ["a", "b", "c"]);
    expect(loadRecents(filePath)).toEqual(["a", "b", "c"]);
  });
});
```

**Step 2: Run to confirm failure**

```bash
bun test packages/core/src/skills/recents.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement `recents.ts`**

Create `packages/core/src/skills/recents.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function loadRecents(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function saveRecents(filePath: string, names: string[]): void {
  writeFileSync(filePath, JSON.stringify(names), "utf8");
}

export function addRecent(existing: string[], name: string, limit = 20): string[] {
  const deduped = [name, ...existing.filter((n) => n !== name)];
  return deduped.slice(0, limit);
}
```

**Step 4: Run tests**

```bash
bun test packages/core/src/skills/recents.test.ts
```

Expected: all PASS.

**Step 5: Export from `index.ts`**

Add to `packages/core/src/skills/index.ts`:

```ts
export { addRecent, loadRecents, saveRecents } from "./recents.js";
```

**Step 6: Type-check and commit**

```bash
bunx tsc --noEmit -p tsconfig.check.json
git add packages/core/src/skills/recents.ts packages/core/src/skills/recents.test.ts packages/core/src/skills/index.ts
git commit -m "feat: add recents module for MRU skill list persistence"
```

---

### Task 4: Create `CommandPalette` component

**Files:**
- Create: `packages/cli/src/ui/CommandPalette.tsx`

The palette renders above `InputArea`. It shows filtered items in MRU-then-alpha order. Selected item is highlighted with `▶` and cyan text. Labels (`[cmd]`, `[skill]`) are rendered in `#87CEEB` (light blue). Max 8 items shown; if more match, show a dim count line at the bottom.

**Step 1: Implement `CommandPalette.tsx`**

```tsx
import { Box, Text, useInput } from "ink";

export interface PaletteItem {
  name: string;
  description: string;
  isCommand: boolean;
}

interface CommandPaletteProps {
  items: PaletteItem[];
  selectedIndex: number;
  onSelectedIndexChange: (i: number) => void;
  onSubmit: (name: string) => void;
  isActive: boolean;
}

const MAX_VISIBLE = 8;

export function CommandPalette({
  items,
  selectedIndex,
  onSelectedIndexChange,
  onSubmit,
  isActive,
}: CommandPaletteProps) {
  const visible = items.slice(0, MAX_VISIBLE);
  const overflow = items.length - MAX_VISIBLE;

  useInput(
    (_, key) => {
      if (key.upArrow) {
        onSelectedIndexChange((selectedIndex - 1 + items.length) % items.length);
      } else if (key.downArrow) {
        onSelectedIndexChange((selectedIndex + 1) % items.length);
      } else if (key.return) {
        const item = items[selectedIndex];
        if (item) onSubmit(item.name);
      }
    },
    { isActive: isActive && items.length > 0 },
  );

  if (items.length === 0) return null;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {visible.map((item, i) => {
        const isSelected = i === selectedIndex;
        const label = item.isCommand ? "[cmd]  " : "[skill]";
        return (
          <Box key={item.name} gap={1}>
            <Text color={isSelected ? "cyan" : "gray"}>{isSelected ? "▶" : " "}</Text>
            <Text color={isSelected ? "cyan" : "white"} bold={isSelected}>
              {"/" + item.name}
            </Text>
            <Text color="#87CEEB">{label}</Text>
            <Text color={isSelected ? "white" : "gray"} dimColor={!isSelected}>
              {item.description}
            </Text>
          </Box>
        );
      })}
      {overflow > 0 && (
        <Text color="gray" dimColor>
          {"  "}...{overflow} more (keep typing to filter)
        </Text>
      )}
    </Box>
  );
}
```

**Step 2: Type-check**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

Expected: no errors.

**Step 3: Commit**

```bash
git add packages/cli/src/ui/CommandPalette.tsx
git commit -m "feat: add CommandPalette component for slash autocomplete"
```

---

### Task 5: Update `InputArea` to handle Tab completion

**Files:**
- Modify: `packages/cli/src/ui/InputArea.tsx`

Add two new props:
- `autocompleteActive: boolean` — when true, Tab is intercepted
- `onTabComplete: () => void` — called when Tab is pressed with autocomplete active

**Step 1: Update `InputAreaProps` and `useInput`**

In `InputArea.tsx`, add to the props interface:

```ts
interface InputAreaProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  disabled: boolean;
  exitPrompt: boolean;
  autocompleteActive: boolean;
  onTabComplete: () => void;
}
```

In the `useInput` handler, add before the final `input && !key.ctrl && !key.meta` branch:

```ts
if (key.tab) {
  if (autocompleteActive) {
    onTabComplete();
  }
  return;
}
```

**Step 2: Type-check**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

Expected: errors about missing props at the `InputArea` usage site in `App.tsx` — that's expected, will be fixed in Task 7.

**Step 3: Commit**

```bash
git add packages/cli/src/ui/InputArea.tsx
git commit -m "feat: handle Tab key in InputArea for autocomplete completion"
```

---

### Task 6: Update `ChatView` to yield arrow keys when palette is active

**Files:**
- Modify: `packages/cli/src/ui/ChatView.tsx`

**Step 1: Add `scrollDisabled` prop**

In `ChatViewProps`:
```ts
interface ChatViewProps {
  messages: ChatMessage[];
  streamingId: string | null;
  onToolConfirm: (result: ConfirmResult) => void;
  pendingToolId: string | null;
  scrollDisabled: boolean;
}
```

Update `useInput` `isActive` condition:
```ts
{ isActive: pendingToolId === null && !scrollDisabled }
```

**Step 2: Type-check**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

Expected: error about missing `scrollDisabled` prop at usage site in `App.tsx` — expected, fixed in Task 7.

**Step 3: Commit**

```bash
git add packages/cli/src/ui/ChatView.tsx
git commit -m "feat: add scrollDisabled prop to ChatView for autocomplete focus management"
```

---

### Task 7: Wire everything together in `App.tsx`

**Files:**
- Modify: `packages/cli/src/ui/App.tsx`
- Modify: `packages/cli/src/commands/chat.ts`

This is the largest task. Read through it carefully before starting.

**New `AppProps` fields:**
```ts
recentsFilePath: string;   // path to ~/.chloe/skill-recents.json
```

**New state in `App`:**
```ts
const [skillsCache, setSkillsCache] = useState<Skill[]>([]);
const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);
const [paletteIndex, setPaletteIndex] = useState(0);
const [suppressPalette, setSuppressPalette] = useState(false);
```

**Load on mount:**
```ts
useEffect(() => {
  const recents = loadRecents(recentsFilePath);
  setRecentlyUsed(recents);
  loadSkills(globalSkillsDir, projectSkillsDir).then(setSkillsCache);
}, [globalSkillsDir, projectSkillsDir, recentsFilePath]);
```

**Reset `paletteIndex` when palette items change length:**
```ts
useEffect(() => {
  setPaletteIndex(0);
}, [paletteItems.length]);
```

**Compute `paletteItems`:**

```ts
const INTERNAL_PALETTE: PaletteItem[] = [
  { name: "help", description: "Show available commands", isCommand: true },
  { name: "reload-skills", description: "Reload skills from disk", isCommand: true },
];

const paletteVisible =
  !suppressPalette &&
  inputValue.startsWith("/") &&
  !inputValue.slice(1).includes(" ");

const paletteItems = useMemo((): PaletteItem[] => {
  if (!paletteVisible) return [];
  const prefix = inputValue.slice(1).toLowerCase();

  const skillItems: PaletteItem[] = skillsCache.map((s) => ({
    name: s.name,
    description: s.description,
    isCommand: false,
  }));

  const allItems = [...INTERNAL_PALETTE, ...skillItems];
  const filtered = allItems.filter((item) => item.name.startsWith(prefix));

  // Sort: MRU first, then alpha
  const recentSet = new Map(recentlyUsed.map((n, i) => [n, i]));
  return filtered.sort((a, b) => {
    const ra = recentSet.get(a.name) ?? Number.MAX_SAFE_INTEGER;
    const rb = recentSet.get(b.name) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}, [paletteVisible, inputValue, skillsCache, recentlyUsed]);
```

**Handle `reload-skills` in `handleSubmit`:**

In the `routeResult` handling block, add:
```ts
if (routeResult.kind === "reload-skills") {
  const newSkills = await loadSkills(globalSkillsDir, projectSkillsDir);
  setSkillsCache(newSkills);
  const internalMsg: ChatMessage = {
    id: makeId(),
    role: "assistant",
    content: "Skills reloaded.",
    state: "complete",
  };
  const userMsg: ChatMessage = {
    id: makeId(),
    role: "user",
    content: text,
    state: "complete",
  };
  setMessages((prev) => [...prev, userMsg, internalMsg]);
  return;
}
```

**Track recently-used on successful dispatch:**

After `agent.run` succeeds (in the `try` block before the `finally`), and also after skill/internal/reload dispatches, record the command name if input started with `/`:

```ts
// After each successful dispatch (skill, internal, reload-skills):
const dispatchedName = text.trim().slice(1).split(" ")[0]?.toLowerCase();
if (dispatchedName) {
  const updated = addRecent(recentlyUsed, dispatchedName);
  setRecentlyUsed(updated);
  saveRecents(recentsFilePath, updated);
}
```

**Suppress palette on Escape:**

In the global `useInput` handler (double-Ctrl+C block), add:
```ts
if (key.escape) {
  setSuppressPalette(true);
  return;
}
```

Reset `suppressPalette` in `onChange`:
```ts
onChange={(v) => {
  setInputValue(v);
  setSuppressPalette(false);
}}
```

**Tab complete handler:**
```ts
const handleTabComplete = useCallback(() => {
  const item = paletteItems[paletteIndex];
  if (!item) return;
  setInputValue(`/${item.name} `);
  setSuppressPalette(false);
}, [paletteItems, paletteIndex]);
```

**When palette's `onSubmit` is called (Enter on palette item):**
```ts
const handlePaletteSubmit = useCallback(
  (name: string) => {
    handleSubmit(`/${name}`);
  },
  [handleSubmit],
);
```

**JSX additions:**

Add `CommandPalette` between `ChatView` and `InputArea`:
```tsx
{paletteItems.length > 0 && (
  <CommandPalette
    items={paletteItems}
    selectedIndex={paletteIndex}
    onSelectedIndexChange={setPaletteIndex}
    onSubmit={handlePaletteSubmit}
    isActive={status === "idle"}
  />
)}
```

Pass new props to `ChatView`:
```tsx
<ChatView
  ...
  scrollDisabled={paletteItems.length > 0}
/>
```

Pass new props to `InputArea`:
```tsx
<InputArea
  ...
  autocompleteActive={paletteItems.length > 0}
  onTabComplete={handleTabComplete}
/>
```

**Update `chat.ts`** — add `recentsFilePath` prop:
```ts
import { join } from "node:path";
import { homedir } from "node:os";

// In chatCommand:
const recentsFilePath = join(homedir(), ".chloe", "skill-recents.json");

render(
  React.createElement(App, {
    ...
    recentsFilePath,
  }),
  ...
);
```

**Step 1: Implement all of the above**

**Step 2: Run type-check**

```bash
bunx tsc --noEmit -p tsconfig.check.json
```

Expected: no errors.

**Step 3: Run all tests**

```bash
bun test
```

Expected: all PASS.

**Step 4: Lint**

```bash
bunx biome check --error-on-warnings .
```

Fix any issues, then:

**Step 5: Commit**

```bash
git add packages/cli/src/ui/App.tsx packages/cli/src/commands/chat.ts
git commit -m "feat: wire slash autocomplete palette into App with skill cache and recents"
```

---

### Task 8: Update `skills/index.ts` exports

**Files:**
- Modify: `packages/core/src/skills/index.ts`

Ensure `loadSkills` and the new symbols are all exported for use in `App.tsx`:

```ts
export { expandArguments, loadSkills } from "./loader.js";
export { routeCommand } from "./router.js";
export { addRecent, loadRecents, saveRecents } from "./recents.js";
export type { CommandResult, Skill, SkillSource } from "./types.js";
export type { RouterOptions } from "./router.js";
```

**Step 1: Update file, type-check, commit**

```bash
bunx tsc --noEmit -p tsconfig.check.json
git add packages/core/src/skills/index.ts
git commit -m "chore: export recents helpers from skills index"
```

---

### Final verification

```bash
bun test
bunx biome check --error-on-warnings .
bunx tsc --noEmit -p tsconfig.check.json
bun run --filter '*' build
```

All should pass with no errors.
