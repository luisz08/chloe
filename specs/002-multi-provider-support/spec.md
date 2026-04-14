# Feature Specification: Multi-Provider Support (Anthropic-Protocol-Compatible)

**Feature Branch**: `002-multi-provider-support`
**Created**: 2026-04-14
**Status**: Draft
**Input**: User description: "系统当前只支持官方 Anthropic，希望还能支持其他兼容 Anthropic 协议的第三方供应商（如 OpenRouter）以及第三方模型"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 通过第三方网关访问 AI (Priority: P1)

用户希望通过 OpenRouter 等兼容 Anthropic 协议的第三方网关运行 Chloe，而不是直接调用官方 Anthropic API。这样可以利用第三方网关的额外功能（统一计费、模型路由、备用渠道等）。

**Why this priority**: 这是本功能的核心需求，直接支持用户通过网关访问 AI 的完整工作流。

**Independent Test**: 通过设置第三方网关的地址和 API Key 启动 Chloe，与助手对话并成功收到回复，即为独立可测试的完整场景。

**Acceptance Scenarios**:

1. **Given** 用户设置了第三方网关的 API Key 和服务地址，**When** 用户通过 CLI 启动对话，**Then** Chloe 通过第三方网关完成对话，响应正常流式输出
2. **Given** 用户设置了第三方网关的 API Key 和服务地址，**When** 用户通过 HTTP API 发送消息，**Then** Chloe 通过第三方网关完成对话，SSE 流式响应正常
3. **Given** 用户未设置服务地址，**When** 用户启动 Chloe，**Then** 系统默认使用官方 Anthropic 端点，行为与当前版本一致

---

### User Story 2 - 通过第三方供应商使用非 Anthropic 模型 (Priority: P2)

用户希望通过兼容 Anthropic 协议的供应商访问非 Anthropic 出品的模型（如经过 Anthropic 协议包装的其他模型），以满足特定场景下的模型选择需求。

**Why this priority**: 在第三方网关路由能力之上，允许选择更多模型，扩展了使用灵活性，但前提是供应商须完整支持 Anthropic 协议。

**Independent Test**: 设置第三方供应商地址和非 Anthropic 模型名称后启动 Chloe，能够正常对话，即为可测试场景。

**Acceptance Scenarios**:

1. **Given** 用户配置了兼容 Anthropic 协议的供应商地址，并设置了该供应商支持的任意模型名称，**When** 用户与 Chloe 对话，**Then** 系统使用指定模型完成对话，工具调用功能正常
2. **Given** 供应商不支持指定模型，**When** 用户与 Chloe 对话，**Then** 系统将供应商返回的错误清晰呈现给用户，而非抛出不明确的内部错误

---

### User Story 3 - 运维人员部署时集中配置供应商 (Priority: P3)

部署 Chloe 服务的运维人员希望通过环境变量统一配置 AI 供应商，无需修改代码或配置文件。

**Why this priority**: 部署场景的标准化配置方式，保持运维友好性，但不影响功能核心。

**Independent Test**: 仅通过修改环境变量即可切换供应商，服务无需重新构建。

**Acceptance Scenarios**:

1. **Given** 部署环境设置了 `CHLOE_API_KEY`、`CHLOE_MODEL` 和可选的 `CHLOE_BASE_URL`，**When** Chloe 服务启动，**Then** 服务按照环境变量配置运行，不依赖任何原有 `ANTHROPIC_*` 变量
2. **Given** 未设置 `CHLOE_API_KEY`，**When** Chloe 启动，**Then** 系统输出清晰的错误提示，指明缺少必要配置，并在启动阶段即终止

---

### Edge Cases

- 用户设置了 `CHLOE_BASE_URL` 但格式不合法（非 URL 格式）时，系统如何处理？
- 供应商地址可访问但不兼容 Anthropic 协议，用户应收到什么提示？
- 网络请求超时或供应商不可达时，错误信息是否足够清晰？

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统 MUST 通过环境变量 `CHLOE_API_KEY` 读取 AI 供应商的认证凭据
- **FR-002**: 系统 MUST 通过环境变量 `CHLOE_MODEL` 读取使用的模型名称，默认值为 `claude-sonnet-4-6`
- **FR-003**: 系统 MUST 通过可选环境变量 `CHLOE_BASE_URL` 读取兼容 Anthropic 协议的第三方服务地址；未设置时使用官方 Anthropic 端点
- **FR-004**: 系统 MUST 弃用 `ANTHROPIC_API_KEY` 和 `ANTHROPIC_MODEL` 环境变量，不再读取这两个变量
- **FR-005**: CLI 和 HTTP API 两种入口 MUST 均遵循上述三个环境变量
- **FR-006**: `CHLOE_API_KEY` 未设置时，系统 MUST 在启动阶段输出明确错误并终止，而非等到首次对话时才报错
- **FR-007**: 供应商返回的错误 MUST 透传给用户，不得被静默吞没或替换为不明确的内部错误
- **FR-008**: 工具调用功能 MUST 在切换供应商后保持正常，前提是该供应商完整支持 Anthropic 协议的工具调用规范

### Key Entities

- **供应商配置（Provider Configuration）**: 描述如何连接某个 AI 供应商，包含服务地址（可选）、认证凭据、模型名称
- **服务地址（Base URL）**: 兼容 Anthropic 协议的 HTTP 端点，用于覆盖官方默认地址

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 用户仅通过修改环境变量，无需改动代码，即可将 Chloe 接入 OpenRouter 等第三方供应商并完成对话
- **SC-002**: 切换供应商后，所有现有功能（对话、工具调用、会话管理、流式输出）均保持正常，零回归
- **SC-003**: 未设置 `CHLOE_BASE_URL` 时，Chloe 的行为与当前版本完全一致（官方 Anthropic 端点，默认模型）
- **SC-004**: 配置错误（缺少 Key）时，用户在启动时即收到明确的错误说明，而非在首次对话时才发现问题

## Assumptions

- 第三方供应商完整实现了 Anthropic Messages API 协议，包括流式响应和工具调用
- 本规格不涵盖 OpenAI 协议或其他非 Anthropic 协议的兼容性，这是未来独立规格的范畴
- 环境变量是唯一支持的配置方式；运行时动态切换供应商不在本规格范围内
- 同一 Chloe 实例在运行期间只使用一个供应商配置，不支持会话级别的供应商路由
- 不提供从旧环境变量（`ANTHROPIC_*`）到新环境变量（`CHLOE_*`）的自动迁移或兼容层
