# Review Guide: Multi-Provider Support (Anthropic-Protocol-Compatible)

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md) | **Tasks:** [tasks.md](tasks.md)
**Generated:** 2026-04-14

---

## What This Spec Does

Chloe 目前将 Anthropic 的 API Key 和模型名称硬编码为 `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` 环境变量，且客户端始终指向官方 Anthropic 端点。本规格让用户能够通过三个新环境变量（`CHLOE_API_KEY`、`CHLOE_MODEL`、`CHLOE_BASE_URL`）将 Chloe 接入任何兼容 Anthropic 协议的第三方供应商，例如 OpenRouter。

**In scope:** 环境变量重命名（破坏性变更）；`AgentConfig` 新增可选 `baseURL` 字段；Anthropic SDK 客户端传入 `baseURL`

**Out of scope:** OpenAI 协议兼容；运行时动态切换供应商；`baseURL` URL 格式校验；从旧变量的自动迁移兼容层

## Bigger Picture

这是 Chloe 从"只支持 Anthropic 官方 API"迈向"可配置 AI 供应商"的第一步。本规格刻意保持范围极小：只做 Anthropic 协议内的扩展，不引入新的抽象层或适配器模式。Anthropic SDK 本身已支持 `baseURL` 构造参数，这使得整个功能的实现只需修改约 20 行代码、4 个文件。

OpenRouter 是本功能的典型目标用户场景。OpenRouter 提供统一的 Anthropic-protocol-compatible 端点（`https://openrouter.ai/api/v1`），支持通过同一接口访问数十个模型，包括非 Anthropic 出品的模型（GPT-4o、Llama、Gemini 等）。由于协议层完全相同，Chloe 的工具调用、流式输出、会话管理均不受影响。

该规格明确选择了**破坏性变更**（不保留 `ANTHROPIC_*` 兼容层），这与项目早期阶段快速演进的风格一致。Constitution 本身也需要同步更新。

---

## Spec Review Guide (30 minutes)

> 以下引导帮助你将 30 分钟聚焦在最需要人工判断的部分。

### Understanding the approach (8 min)

阅读 [spec.md 的用户故事 1](spec.md#user-story-1--通过第三方网关访问-ai-priority-p1) 和 [功能需求](spec.md#functional-requirements)。阅读时思考：

- FR-003 说未设置 `CHLOE_BASE_URL` 时"使用官方 Anthropic 端点"——这个默认值是 SDK 内部处理的，代码中不会出现 hardcoded URL。这种隐式默认是否符合你对"可审计配置"的期望？
- FR-005 是破坏性变更（弃用 `ANTHROPIC_*`）。项目当前处于什么阶段？是否有需要迁移的外部使用者？

### Key decisions that need your eyes (12 min)

**破坏性变更 vs 向后兼容** ([spec.md 假设章节](spec.md#assumptions))

规格明确选择不提供从 `ANTHROPIC_*` 到 `CHLOE_*` 的兼容层。研究文档中记录了决策依据（用户明确选择方案 B）。
- 这个决策现在是否合适？是否有 Docker 镜像、CI 脚本、或文档引用了 `ANTHROPIC_API_KEY` 需要同步更新？

**`baseURL` 不在启动时做 URL 格式校验** ([research.md Decision 3](research.md#decision-3-baseurl-的校验时机))

当前决策是不做格式校验，依赖 SDK 在首次调用时报错。
- [Edge Cases](spec.md#edge-cases) 中提到了这个场景。首次调用时才报错，用户体验是否可接受？或者你认为应该在本次就加上启动时校验？

**Constitution 必须同步更新** ([tasks.md T007](tasks.md#phase-4-user-story-3--运维人员集中配置供应商-priority-p3))

T007 要求在实现时更新 `.specify/memory/constitution.md`。这是 spec review 中发现的必要项。
- Constitution 是否有其他地方（例如 Development Workflow 章节）也引用了 `ANTHROPIC_*` 变量，需要一并更新？

### Areas where I'm less certain (5 min)

- [spec.md FR-007](spec.md#functional-requirements)：规格要求"供应商错误 MUST 透传给用户"，但没有对应的实现任务（因为现有代码已经透传了）。我假设 `runLoop` 的现有错误传播机制已覆盖此需求，但没有独立的测试验证这一点。如果第三方供应商返回非标准错误格式，透传行为是否仍然正确？

- [tasks.md T003](tasks.md#phase-2-user-story-1--通过第三方网关访问-ai-priority-p1-) 中 T003 标记了 [P]（可与 T004、T005 并行），但实际上 T003 隐含依赖 T001、T002 完成。这在 Phase 2 依赖说明中有描述，但 tasks.md 本身的 [P] 标记可能引起误解——是否应该去掉或加注解？

### Risks and open questions (5 min)

- 如果 OpenRouter 的 Anthropic-compatible 端点行为与官方 Anthropic API 存在细微差异（例如 token 计数、错误码格式），[FR-008（工具调用保持正常）](spec.md#functional-requirements) 的前提假设"供应商完整实现了 Anthropic 协议"是否足够？是否需要一个兼容性声明或集成测试？

- [spec.md Assumptions](spec.md#assumptions) 排除了"运行时动态切换供应商"。如果未来需要支持，当前的 `AgentConfig` 结构（在构造 `Agent` 时一次性传入）是否为扩展留下了足够的空间？

---
*Full context in linked [spec](spec.md) and [plan](plan.md).*
