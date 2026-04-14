# Data Model: Multi-Provider Support

**Branch**: `002-multi-provider-support` | **Date**: 2026-04-14

## Changed Entity: AgentConfig

**Before:**
```typescript
interface AgentConfig {
  model: string;
  apiKey: string;
  tools: Tool[];
  storage: StorageAdapter;
}
```

**After:**
```typescript
interface AgentConfig {
  model: string;
  apiKey: string;
  baseURL?: string;   // 新增：兼容 Anthropic 协议的第三方供应商端点（可选）
  tools: Tool[];
  storage: StorageAdapter;
}
```

**Field: `baseURL`**
- Type: `string | undefined`
- Required: No
- Default: undefined（SDK 使用官方 Anthropic 端点）
- Validation: 无运行时校验；由 SDK 在首次 API 调用时验证
- Example values:
  - `undefined` → 使用 `https://api.anthropic.com`
  - `"https://openrouter.ai/api/v1"` → 通过 OpenRouter 路由

## Environment Variable Contract

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `CHLOE_API_KEY` | 是 | — | AI 供应商认证凭据 |
| `CHLOE_MODEL` | 否 | `claude-sonnet-4-6` | 模型名称（任何供应商支持的模型 ID）|
| `CHLOE_BASE_URL` | 否 | undefined | 兼容 Anthropic 协议的第三方端点 URL |

**弃用变量（不再读取）：**
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`

## No New Entities

本功能不引入新的数据实体，不涉及存储层变更。
