# Research: Global Config — 003-global-config

## Decision 1: TOML Parser

**Decision**: Use `smol-toml`  
**Rationale**: Zero runtime dependencies, full TOML 1.0 compliance, works with Bun via npm. Provides `parse()` and `stringify()` — both needed for the read and write paths.  
**Alternatives considered**:
- `@iarna/toml`: older, larger, effectively unmaintained
- `toml`: parse-only, no stringify — cannot support `config set`
- Hand-rolled parser: unnecessary complexity, maintenance burden

**Install**: `bun add smol-toml` inside `packages/core/` (or root workspace if shared).

---

## Decision 2: Interactive Prompts for `chloe config init`

**Decision**: Use `node:readline` (already imported in `chat.ts`)  
**Rationale**: `readline` is already a project dependency and used in the chat command. Simple line-by-line prompts for 3 fields do not warrant an external library.  
**Alternatives considered**:
- `@inquirer/prompts`: feature-rich but overkill for 3 fields; adds a dependency
- Raw `process.stdin`: lower-level, more boilerplate

**Pattern**:
```typescript
import { createInterface } from "node:readline";

function askQuestion(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, answer => { rl.close(); resolve(answer); });
  });
}
```

---

## Decision 3: TOML In-Place Update for `config set`

**Decision**: Full file rewrite via `smol-toml`'s `stringify()`  
**Rationale**: Spec explicitly documents "comments not preserved". Full rewrite avoids fragile regex or line-patch logic. `stringify()` produces clean, readable TOML.  
**Alternatives considered**:
- Line-by-line regex replacement: brittle, sensitive to whitespace and comment placement
- TOML AST manipulation with comment preservation: no available library supports this

---

## Decision 4: File Permissions

**Decision**: Use `fs.chmodSync(path, 0o600)` after writing the config file  
**Rationale**: `Bun.write()` does not accept a file mode parameter (as of Bun 1.1). `fs.chmodSync` is available via Bun's Node.js compatibility layer.  
**Alternatives considered**:
- `Bun.file()` with mode option: not yet supported upstream
- `open()` syscall via FFI: unnecessarily low-level

---

## Decision 5: `loadConfig()` Placement

**Decision**: `packages/core/src/config.ts`, exported from `packages/core/src/index.ts`  
**Rationale**: Constitution Principle I (Core-Library-First) — no business logic in entry points. Config loading is business logic shared by CLI and API. A single module in core keeps it DRY (Principle IV).  
**Alternatives considered**:
- New `packages/config` package: unnecessary indirection for a single-file module
- Inline in each command: violates both Core-Library-First and DRY

---

## Decision 6: Migration Timing

**Decision**: Migration runs inside `loadConfig()`, transparently, before returning `dbPath`  
**Rationale**: All callers go through `loadConfig()` — it is the natural chokepoint. The migration is automatic and requires no caller awareness.  
**Alternatives considered**:
- Separate `migrateDb()` call in each command: callers should not need to know about directory layout changes
- Inside `SQLiteStorageAdapter` constructor: storage adapters should not know about directory conventions
