# Manual Test Cases: Context Compression (014)

**Branch**: `014-context-compression`  
**Date**: 2026-04-23  
**Tester**: _______________

---

## 环境准备

```bash
cd /home/luis/code/chloe-014-context-compression
bun install

# 启动 CLI（指定测试用 session 名，避免污染正式数据）
bun run packages/cli/src/index.ts chat --session test-014
```

如需查看当前 session 的 DB 数据：
```bash
sqlite3 ~/.chloe/sessions/chloe.db "SELECT id, summary IS NOT NULL as has_summary FROM sessions WHERE id LIKE 'test-%';"
```

---

## MT-001：空 session 执行 `/compact`

**对应**: FR-014、US4-AC4

**前置条件**: 新建一个没有任何消息历史的 session

```bash
bun run packages/cli/src/index.ts chat --session test-014-empty
```

**操作步骤**:
1. 不发任何消息，直接输入 `/compact` 并回车

**期望结果**:
- [ ] CLI 显示友好提示（例如"Nothing to compact — this session has no history yet."）
- [ ] 没有报错，没有崩溃
- [ ] session 仍然正常可用，可以继续发消息

**实际结果**: _______________

---

## MT-002：`/compact` 手动压缩

**对应**: FR-012、FR-013、US4-AC1

**前置条件**: session 中有若干对话（不需要达到自动阈值）

**操作步骤**:
1. 发送至少 5 条消息，内容包含可验证的具体信息，例如：
   - "我叫张伟，今天在做一个关于天文望远镜的报告"
   - "我的报告主题是韦布空间望远镜"
   - "我目前写了摘要和第一章"
   - "第一章讲的是韦布的发射历史，2021年12月25日发射"
   - "现在需要帮我想第二章的标题"
2. 等待最后一条回复完成
3. 输入 `/compact` 并回车

**期望结果**:
- [ ] 出现系统通知（黄色"System"标签），内容类似：
  `⚠️ Context compressed: N earlier messages were summarized. The most recent M messages are preserved in full.`
- [ ] N 和 M 的数字合理（N + M ≈ 发送的消息总条数 × 2）
- [ ] 通知持久显示在对话历史中，不会消失
- [ ] 随后发消息问"我的名字是什么？" → chloe 能正确答出"张伟"

**实际结果**: _______________

---

## MT-003：压缩后仍能召回压缩区内容

**对应**: SC-002、US1-AC2

**前置条件**: 完成 MT-002 的压缩步骤

**操作步骤**:
1. 在 MT-002 压缩后，发送以下问题：
   - "韦布望远镜是哪一年发射的？"
   - "我的报告第一章写了什么？"
   - "我目前写到第几章了？"

**期望结果**:
- [ ] chloe 能正确回答"2021年"（来自压缩区）
- [ ] chloe 能正确描述第一章内容（发射历史）
- [ ] chloe 知道"写了摘要和第一章"
- [ ] 无幻觉（不编造不存在的内容）

**实际结果**: _______________

---

## MT-004：重启 session 后摘要持久化

**对应**: FR-006、FR-007、SC-004、US2-AC1

**前置条件**: 完成 MT-002 的压缩步骤，session 名为 `test-014`

**操作步骤**:
1. 退出 CLI（Ctrl+C）
2. 验证 DB 中确实存有摘要：
   ```bash
   sqlite3 ~/.chloe/sessions/chloe.db "SELECT length(summary) FROM sessions WHERE id='test-014';"
   ```
3. 重新启动同一 session：
   ```bash
   bun run packages/cli/src/index.ts chat --session test-014
   ```
4. 发送："你还记得我叫什么名字吗？"
5. 发送："我的报告是关于什么的？"

**期望结果**:
- [ ] 步骤 2 输出的 length > 0（摘要已持久化）
- [ ] chloe 正确回答"张伟"
- [ ] chloe 正确回答"韦布空间望远镜"
- [ ] 新进程中无需重新告知之前的上下文

**实际结果**: _______________

---

## MT-005：未压缩的 session 重启无变化

**对应**: SC-006、US2-AC2

**前置条件**: 一个有少量消息（< 20 条）、从未被压缩的 session

**操作步骤**:
1. 新建 session，发 3 条消息：
   ```bash
   bun run packages/cli/src/index.ts chat --session test-014-short
   ```
   - "我在学 TypeScript"
   - "请解释什么是泛型"
   - （等待回复）
2. 退出并重启同一 session
3. 发送："我之前问过你什么问题？"

**期望结果**:
- [ ] 重启后加载完整历史（无摘要注入）
- [ ] chloe 能正确回答"你问过我什么是泛型"
- [ ] 行为与压缩前完全一致

**实际结果**: _______________

---

## MT-006：自动压缩触发（低阈值配置）

**对应**: FR-001、FR-002、FR-008、US1-AC1、SC-001、SC-003

> 此测试通过调低阈值来模拟自动触发，不需要真的填满 200k token。

**操作步骤**:
1. 编辑 `~/.chloe/settings/config.toml`，添加：
   ```toml
   [context_compression]
   threshold = 0.01
   keep_recent_count = 3
   ```
2. 启动新 session：
   ```bash
   bun run packages/cli/src/index.ts chat --session test-014-auto
   ```
3. 发送超过 3 条消息，使消息数 > `keep_recent_count`（发 5-6 条即可）：
   - "消息1：现在是下午两点"
   - "消息2：今天是星期三"
   - "消息3：我在做上下文压缩测试"
   - "消息4：这是第四条消息"
   - 等待最后一次回复，然后发送第 5 条消息触发压缩：
   - "消息5：请随便说点什么"

**期望结果**:
- [ ] 发送第 5 条消息后，自动触发压缩
- [ ] 系统通知出现（与 MT-002 格式相同），显示"The most recent 3 messages are preserved in full"
- [ ] 回复正常返回，无 API 报错
- [ ] 整个压缩 + 回复过程耗时 < 10 秒（SC-003）
- [ ] 发送后询问"消息1的内容是什么？" → chloe 能通过摘要正确回答

**实际结果**: _______________

**恢复配置**（测试后删除或还原上述配置段）

---

## MT-007：多次自动压缩（re-compression）

**对应**: FR-011、US1-AC3

**前置条件**: 使用 MT-006 的低阈值配置（threshold=0.01, keep_recent_count=3）

**操作步骤**:
1. 继续使用 `test-014-auto` session（或新建），发送足够多的消息触发**两次**压缩
2. 第一次压缩触发后，继续发送 3-4 条新消息再次触发第二次压缩
3. 压缩后询问第一次压缩之前发送的内容

**期望结果**:
- [ ] 第二次压缩时系统通知再次出现
- [ ] DB 中 summary 字段被更新（不是追加，而是替换为新摘要）
- [ ] 第二次压缩后仍能（至少部分）召回第一次压缩前的信息

**实际结果**: _______________

---

## MT-008：`/compact` 再次压缩已有摘要的 session

**对应**: US4-AC3

**前置条件**: 完成 MT-002（session 已有摘要）

**操作步骤**:
1. 使用已有摘要的 session，再发 3 条新消息
2. 输入 `/compact`

**期望结果**:
- [ ] 压缩成功，通知再次出现
- [ ] DB 中 summary 被更新为包含旧摘要内容的新摘要
- [ ] 询问旧摘要中的内容仍可正确回答

**实际结果**: _______________

---

## MT-009：通知持久性验证

**对应**: FR-008、US3-AC2

**前置条件**: 已触发过至少一次压缩（自动或手动）

**操作步骤**:
1. 压缩后继续发送 3-5 条消息
2. 向上滚动对话历史

**期望结果**:
- [ ] 压缩通知（System 消息）仍在对话历史中可见
- [ ] 通知不会随新消息消失
- [ ] 通知的黄色"System"标签样式正确显示

**实际结果**: _______________

---

## MT-010：短 session 无性能影响

**对应**: SC-006

**操作步骤**:
1. 新建 session，发 1 条简单消息："Hello"
2. 主观感受响应速度

**期望结果**:
- [ ] 响应速度与平时无明显差异（无额外 token 计数 API 调用延迟）
- [ ] 对话正常进行，无任何压缩相关通知

**实际结果**: _______________

---

## MT-011：API 服务器路径（可选）

**对应**: 回归测试，确保 API 包也传递了 contextCompression 配置

**操作步骤**:
1. 启动 API 服务器：
   ```bash
   bun run packages/api/src/index.ts
   ```
2. 创建 session 并发送消息：
   ```bash
   curl -X POST http://localhost:3000/sessions -H "Content-Type: application/json" -d '{"name":"api-test"}'
   curl -X POST http://localhost:3000/sessions/api-test/messages -H "Content-Type: application/json" -d '{"message":"Hello"}'
   ```

**期望结果**:
- [ ] 请求成功（200），无报错
- [ ] 服务器日志无异常

**实际结果**: _______________

---

## 测试结果汇总

| 用例   | 对应需求        | 结果 | 备注 |
|--------|----------------|------|------|
| MT-001 | FR-014         | ⬜   |      |
| MT-002 | FR-012/013     | ⬜   |      |
| MT-003 | SC-002         | ⬜   |      |
| MT-004 | FR-006/007, SC-004 | ⬜ |   |
| MT-005 | SC-006         | ⬜   |      |
| MT-006 | FR-001/002/008, SC-001/003 | ⬜ | |
| MT-007 | FR-011         | ⬜   |      |
| MT-008 | US4-AC3        | ⬜   |      |
| MT-009 | FR-008, US3-AC2 | ⬜  |      |
| MT-010 | SC-006         | ⬜   |      |
| MT-011 | 回归           | ⬜   |      |

**总体结论**: ⬜ 通过 / ⬜ 阻塞缺陷 / ⬜ 非阻塞缺陷

**发现的问题**:

1. _______________
2. _______________
