# Implementation Plan: Multi-Provider Support (Anthropic-Protocol-Compatible)

**Branch**: `002-multi-provider-support` | **Date**: 2026-04-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-multi-provider-support/spec.md`

## Summary

允许 Chloe 通过环境变量 `CHLOE_API_KEY`、`CHLOE_MODEL`、`CHLOE_BASE_URL` 连接任何兼容 Anthropic 协议的第三方供应商（如 OpenRouter）。核心改动是在 `AgentConfig` 中增加可选 `baseURL` 字段，并将其传递给 Anthropic SDK 客户端。同时弃用 `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` 环境变量，改为统一使用 `CHLOE_*` 前缀。

## Technical Context

**Language/Version**: TypeScript 5.x  
**Primary Dependencies**: `@anthropic-ai/sdk`（已存在，SDK 原生支持 `baseURL` 参数）  
**Storage**: N/A  
**Testing**: `bun test`  
**Target Platform**: Bun ≥ 1.1，Linux  
**Project Type**: Bun workspace monorepo（packages/core, packages/cli, packages/api）  
**Performance Goals**: N/A（无性能影响）  
**Constraints**: 未设置 `CHLOE_BASE_URL` 时行为必须与当前版本完全一致  
**Scale/Scope**: 修改 4 个文件，新增/修改约 20 行代码

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 评估 | 状态 |
|------|------|------|
| Core-Library-First | 变更从 `packages/core/src/agent/types.ts` 发起，CLI/API 仅读取环境变量 | ✓ PASS |
| Strict TypeScript | `baseURL?: string` 合法可选字段；`new Anthropic({ apiKey, baseURL })` 符合 SDK 类型定义 | ✓ PASS |
| Biome | 无新模式，现有 Biome 配置覆盖 | ✓ PASS |
| DRY | 单一变更点（AgentConfig），两个入口点复用同一接口 | ✓ PASS |
| Plugin Contracts | StorageAdapter、Tool 接口均不受影响 | ✓ PASS |
| Streaming Always | runLoop 和流式处理层不受影响 | ✓ PASS |
| Unit Tests | 需更新 `loop.test.ts` 中 Anthropic 客户端的 mock 以验证 baseURL 传递 | ✓ PASS（需新增测试）|
| Human-in-the-Loop | confirmTool 机制不受影响 | ✓ PASS |

**⚠️ Constitution 技术栈描述需同步更新**：  
`.specify/memory/constitution.md` 的 Technology Stack 章节明确列出 `ANTHROPIC_MODEL`，实现时必须同步更新该文件。

## Project Structure

### Documentation (this feature)

```text
specs/002-multi-provider-support/
├── plan.md              # 本文件
├── research.md          # Phase 0 输出
├── data-model.md        # Phase 1 输出
├── contracts/
│   └── env-vars.md      # 环境变量契约
└── tasks.md             # Phase 2 输出（/speckit-tasks 生成）
```

### Source Code (files to modify)

```text
packages/core/src/agent/
├── types.ts             # AgentConfig 新增 baseURL?: string
└── agent.ts             # Anthropic 客户端构造传入 baseURL

packages/cli/src/
├── commands/chat.ts     # 读取 CHLOE_* 环境变量
└── index.ts             # 检查 CHLOE_API_KEY（替换 ANTHROPIC_API_KEY）

packages/api/src/
└── index.ts             # 读取 CHLOE_* 环境变量

.specify/memory/
└── constitution.md      # 同步更新技术栈描述

tests（已存在）:
packages/core/src/agent/
└── loop.test.ts         # 新增：验证 baseURL 传递正确
```
