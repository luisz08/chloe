# 手动测试用例 — Plugin System (013)

测试夹具位于项目内 `specs/013-plugin-system/test-marketplace/`（已加入 .gitignore），无需网络，全程使用本地目录。

---

## 准备

```bash
# 确认 CLI 可用
bun run --filter '*' build
cd packages/cli && bun run build

# 清理上一次测试遗留的状态（如需要）
rm -rf ~/.chloe/plugins
rm -f /tmp/chloe-hook-test.log
```

---

## TC-01  添加本地 Marketplace

**目标：** `/plugin marketplace add --from-dir` 能正确注册本地 marketplace。

```bash
chloe plugin marketplace add --from-dir $(pwd)/specs/013-plugin-system/test-marketplace
```

**预期输出：**
```
Marketplace added: test-mkt
```

**验证：**
```bash
chloe plugin marketplace list
# 应显示:  test-mkt  $(pwd)/specs/013-plugin-system/test-marketplace
```

**检查存储：**
```bash
cat ~/.chloe/plugins/known_marketplaces.json
# 应包含 "test-mkt" 条目，source.type = "local"
```

---

## TC-02  重复添加应报错

```bash
chloe plugin marketplace add --from-dir $(pwd)/specs/013-plugin-system/test-marketplace
```

**预期：** 报错 `Marketplace already registered: test-mkt`（不应静默覆盖）

---

## TC-03  列出 Marketplace 中的插件（间接验证）

```bash
chloe plugin list
# 当前应显示: No plugins installed.

chloe plugin install hello-plugin@test-mkt
```

**预期输出：**
```
Installed: hello-plugin@test-mkt
```

**验证存储：**
```bash
cat ~/.chloe/plugins/installed.json
# 应包含 "hello-plugin@test-mkt"，enabled: true，version: "1.0.0"

ls ~/.chloe/plugins/cache/hello-plugin@test-mkt/
# 应包含 plugin.json, skills/, commands/
```

---

## TC-04  安装第二个插件

```bash
chloe plugin install hook-plugin@test-mkt
chloe plugin list
```

**预期输出（表格）：**
```
NAME              MARKETPLACE  VERSION  STATUS
hello-plugin      test-mkt     1.0.0    enabled
hook-plugin       test-mkt     1.0.0    enabled
```

---

## TC-05  插件技能在 `/help` 中可见

```bash
chloe chat
# 在 chat 界面输入:
/help
```

**预期：** 帮助输出中应包含来自插件的技能名称（`greet`、`plugin-info`、`hook-status`）。

---

## TC-06  调用插件 Skill（SKILL.md 格式）

在 `chloe chat` 中输入：
```
/greet
```

**预期：** 模型用友好问候语回应（早上好/下午好等），说明该 skill 的 prompt 被正确注入。

---

## TC-07  调用插件 Skill（commands/ 格式）

在 `chloe chat` 中输入：
```
/plugin-info
```

**预期：** 模型回报 hello-plugin 的名称、版本、来源信息，并说 "Plugin system is working correctly!"

---

## TC-08  Hook 触发验证

**前提：** hook-plugin 已安装（TC-04）。

在 `chloe chat` 中发送任意消息（会触发工具调用，例如让它列目录）：
```
list the files in /tmp
```

然后检查日志：
```bash
cat /tmp/chloe-hook-test.log
```

**预期（日志中应包含）：**
```
[HH:MM:SS] SessionStart session=<id>
[HH:MM:SS] UserPromptSubmit session=<id>
[HH:MM:SS] PreToolUse tool=bash
[HH:MM:SS] PostToolUse tool=bash
[HH:MM:SS] SessionEnd session=<id>
```

---

## TC-09  禁用插件后 Skill 消失

```bash
chloe plugin disable hello-plugin@test-mkt

# 验证状态
chloe plugin list
# hello-plugin 应显示 disabled

# 验证存储
cat ~/.chloe/plugins/installed.json | grep -A3 hello-plugin
# enabled 应为 false
```

在 `chloe chat` 中输入 `/greet`：
**预期：** 报错 `Unknown command: /greet`（插件 skill 不再可用）

---

## TC-10  重新启用插件

```bash
chloe plugin enable hello-plugin@test-mkt
```

在 `chloe chat` 中再次输入 `/greet`：
**预期：** 正常响应（skill 恢复可用）

---

## TC-11  卸载插件

```bash
chloe plugin uninstall hello-plugin@test-mkt
chloe plugin list
# 应只剩 hook-plugin
```

**验证缓存已删除：**
```bash
ls ~/.chloe/plugins/cache/
# 不应有 hello-plugin@test-mkt 目录
```

在 `chloe chat` 中输入 `/greet`：
**预期：** `Unknown command: /greet`

---

## TC-12  Slash 命令方式管理插件（通过 chat 界面）

在 `chloe chat` 中直接输入：
```
/plugin list
/plugin install hello-plugin@test-mkt
/plugin list
/plugin disable hello-plugin@test-mkt
/plugin enable hello-plugin@test-mkt
/plugin uninstall hello-plugin@test-mkt
```

**预期：** 每条命令都返回对应的文字确认，与 CLI 行为一致。

---

## TC-13  删除 Marketplace

```bash
chloe plugin marketplace remove test-mkt
```

**预期：** `Marketplace removed: test-mkt`

**验证：**
```bash
chloe plugin marketplace list
# No marketplaces registered.

cat ~/.chloe/plugins/installed.json
# hook-plugin@test-mkt 也应被一并清除（cascade uninstall）
```

---

## TC-14  错误路径验证

```bash
# 安装不存在的插件
chloe plugin install nonexistent@test-mkt
# 预期: Plugin "nonexistent" not found in marketplace "test-mkt"
# (如果 marketplace 已被删除，先重新 add)

# 安装到不存在的 marketplace
chloe plugin install hello-plugin@fake-mkt
# 预期: Marketplace not found: fake-mkt

# 重复安装
chloe plugin install hello-plugin@test-mkt
chloe plugin install hello-plugin@test-mkt
# 预期: Plugin already installed: hello-plugin@test-mkt

# 对未安装的插件操作
chloe plugin disable nonexistent@test-mkt
# 预期: Plugin not installed: nonexistent@test-mkt
```

---

## TC-15  Hook 异常不影响主流程

编辑 hook-plugin 缓存中的 hooks.json，让某个 hook 以非零退出：
```bash
cat > ~/.chloe/plugins/cache/hook-plugin@test-mkt/hooks/hooks.json << 'EOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "exit 1" }]
      }
    ]
  }
}
EOF
```

在 `chloe chat` 中发送任意需要工具调用的消息：
**预期：**
- 主流程正常完成（hook 失败不影响 agent）
- 可在 chloe 日志文件中找到 `hook exited with non-zero` warning

---

## 测试完成后清理

```bash
rm -rf ~/.chloe/plugins
rm -f /tmp/chloe-hook-test.log
```
