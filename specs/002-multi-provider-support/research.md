# Research: Multi-Provider Support

**Branch**: `002-multi-provider-support` | **Date**: 2026-04-14

## Decision 1: Anthropic SDK `baseURL` 支持

**Decision**: 使用 Anthropic SDK 原生的 `baseURL` 构造参数  
**Rationale**: `@anthropic-ai/sdk` 在 `Anthropic` 构造函数中直接支持 `baseURL` 选项，无需任何适配器或额外依赖。OpenRouter 等 Anthropic-protocol-compatible 供应商的端点与官方 API 在调用层面完全透明。  
**Alternatives considered**:  
- 自定义 HTTP 客户端拦截：复杂度高，维护成本大，无必要  
- `httpAgent` 代理方案：用于 IP 代理，不适用于 API 端点切换

## Decision 2: 环境变量命名（CHLOE_* 前缀）

**Decision**: 完全替换为 `CHLOE_API_KEY`、`CHLOE_MODEL`、`CHLOE_BASE_URL`，不保留旧变量  
**Rationale**: 用户明确选择破坏性变更（方案 B）。`ANTHROPIC_*` 前缀将供应商名称硬编码进配置，与"支持多供应商"的目标语义矛盾。`CHLOE_*` 前缀是产品名前缀，与具体供应商解耦。  
**Alternatives considered**:  
- 新增变量 + fallback 旧变量（方案 A）：被用户明确拒绝

## Decision 3: `baseURL` 的校验时机

**Decision**: 启动阶段不做 URL 格式校验，依赖 Anthropic SDK 在首次调用时抛出错误  
**Rationale**: 实现最小化原则。SDK 本身会在错误的 baseURL 下给出清晰的错误信息。在启动时加 URL 格式校验会增加 10+ 行代码，但对用户体验提升有限（错误几秒后才会出现，而非立即）。此决策可在未来 FR-006 扩展时调整。  
**Alternatives considered**:  
- 启动时校验 URL 格式（spec 中 Edge Case 提及）：留作 future enhancement，不在本次范围

## No unknowns remaining

所有 NEEDS CLARIFICATION 项均已解决。可直接进入 Phase 1。
