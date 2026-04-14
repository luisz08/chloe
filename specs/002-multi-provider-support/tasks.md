# Tasks: Multi-Provider Support (Anthropic-Protocol-Compatible)

**Input**: Design documents from `/specs/002-multi-provider-support/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/env-vars.md ✓

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[US1/US2/US3]**: Which user story this task belongs to

---

## Phase 1: Foundational — Core Library Changes

**Purpose**: 更新 `@chloe/core` 中的 `AgentConfig` 接口和 `Agent` 构造逻辑。所有用户故事均依赖此阶段完成。

**⚠️ CRITICAL**: Phase 2 全部任务在此阶段完成后才能开始

- [ ] T001 在 `packages/core/src/agent/types.ts` 的 `AgentConfig` 接口中新增 `baseURL?: string` 字段
- [ ] T002 在 `packages/core/src/agent/agent.ts` 的 `Agent` 构造函数中，将 `baseURL` 从 `config` 传入 `new Anthropic({ apiKey, baseURL })`

**Checkpoint**: `@chloe/core` 支持 `baseURL`，运行 `bun test` 验证无回归

---

## Phase 2: User Story 1 — 通过第三方网关访问 AI (Priority: P1) 🎯 MVP

**Goal**: CLI 和 API 两个入口点读取 `CHLOE_*` 环境变量并传递 `baseURL` 给 Agent

**Independent Test**: 设置 `CHLOE_API_KEY=<openrouter-key> CHLOE_BASE_URL=https://openrouter.ai/api/v1 CHLOE_MODEL=anthropic/claude-3-5-sonnet`，运行 `chloe chat --session test`，可正常对话

- [ ] T003 [P] [US1] 在 `packages/cli/src/commands/chat.ts` 中将 `process.env.ANTHROPIC_MODEL` 替换为 `process.env.CHLOE_MODEL`，`process.env.ANTHROPIC_API_KEY` 替换为 `process.env.CHLOE_API_KEY`，并读取 `process.env.CHLOE_BASE_URL` 传入 `createAgent`（需 T001、T002 完成后开始；[P] 表示可与 T004、T005 并行）
- [ ] T004 [P] [US1] 在 `packages/cli/src/index.ts` 中将 `ANTHROPIC_API_KEY` 守卫替换为 `CHLOE_API_KEY`，更新错误提示信息（需 T001、T002 完成后开始；[P] 表示可与 T003、T005 并行）
- [ ] T005 [P] [US1] 在 `packages/api/src/index.ts` 中将 `ANTHROPIC_API_KEY` 和 `ANTHROPIC_MODEL` 替换为 `CHLOE_API_KEY`、`CHLOE_MODEL`，并读取 `CHLOE_BASE_URL` 传入 `createAgent`（需 T001、T002 完成后开始；[P] 表示可与 T003、T004 并行）

**Checkpoint**: US1 完整可用。设置第三方网关环境变量可正常对话；不设置 `CHLOE_BASE_URL` 时行为与当前版本完全一致

---

## Phase 3: User Story 2 — 使用非 Anthropic 模型 (Priority: P2)

**Goal**: 任意模型名称（包含 `anthropic/`、`openai/` 等 namespace 前缀的 OpenRouter 模型）均可通过 `CHLOE_MODEL` 指定

**Independent Test**: 设置 `CHLOE_MODEL=openai/gpt-4o`（或其他 OpenRouter 支持模型），通过第三方网关对话成功

> **Note**: US2 的实现已在 Phase 2 的 T003~T005 中完全覆盖（`CHLOE_MODEL` 接受任意字符串）。Phase 3 仅需验证性测试任务。

- [ ] T006 [P] [US2] 在 `packages/core/src/agent/loop.test.ts` 中新增两个单元测试：(a) 构造带 `baseURL` 的 `AgentConfig` 时，验证 `Anthropic` 客户端以正确的 `baseURL` 实例化；(b) 模拟供应商抛出错误时，验证错误原样透传给调用方（覆盖 FR-007 错误透传需求）

**Checkpoint**: 单元测试通过，`bun test` 绿色

---

## Phase 4: User Story 3 — 运维人员集中配置供应商 (Priority: P3)

**Goal**: 仅通过环境变量即可完整配置供应商，不依赖 `ANTHROPIC_*` 变量

**Independent Test**: 清除所有 `ANTHROPIC_*` 变量，仅设置 `CHLOE_*` 变量，两个入口（CLI + API）均正常启动

> **Note**: US3 的实现已在 Phase 2 的 T003~T005 中完全覆盖。Phase 4 仅需宪法同步更新。

- [ ] T007 [US3] 在 `.specify/memory/constitution.md` 的 Technology Stack 章节中，将 `ANTHROPIC_MODEL` 更新为 `CHLOE_MODEL`，将 AI provider 描述更新为"可通过 `CHLOE_BASE_URL` 切换至兼容 Anthropic 协议的第三方供应商"

**Checkpoint**: Constitution 与实现保持一致

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T008 [P] 运行 `npm run lint`（`biome check --error-on-warnings`），修复所有 lint 问题
- [ ] T009 运行 `npm test`（`bun test`），确认所有测试通过，无回归

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: 无依赖，立即开始
- **Phase 2 (US1)**: 依赖 Phase 1 完成 — 必须等待
- **Phase 3 (US2)**: 依赖 Phase 2（T003~T005）完成
- **Phase 4 (US3)**: 可与 Phase 3 并行（T007 仅修改 constitution，无代码依赖）
- **Phase 5 (Polish)**: 依赖所有上述阶段完成

### Parallel Opportunities

- T003、T004、T005 修改不同文件，**可以并行**（均依赖 T001、T002 完成）
- T006 仅新增测试，**可与 T007 并行**
- T008（lint）和 T009（test）必须顺序运行

---

## Implementation Strategy

### MVP (User Story 1 Only)

1. 完成 Phase 1（T001~T002）
2. 完成 Phase 2（T003~T005，可并行）
3. **验证**：测试 OpenRouter 集成
4. 可立即使用第三方网关

### Full Implementation

1. Phase 1 → Phase 2 → Phase 3 + Phase 4（并行）→ Phase 5
2. 共 9 个任务，预计 30~60 分钟实现工时

---

## Notes

- T003~T005 标记为 [P] 表示可并行执行（各自修改不同文件）
- 所有任务在同一 feature branch `002-multi-provider-support` 上执行
- T007（constitution 更新）是强制任务，不可省略
