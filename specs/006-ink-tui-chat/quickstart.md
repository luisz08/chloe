# Quickstart: ink TUI Chat Interface

## Prerequisites

- Bun ≥ 1.3.12 (for `Bun.markdown.ansi()`)
- API key configured (`CHLOE_API_KEY` or `chloe config init`)
- Modern terminal emulator (Kitty, WezTerm, Alacritty, iTerm2, Ghostty, or similar for Shift+Enter support)

## Running

```bash
# Start a named chat session
chloe chat --session my-session

# Auto-confirm all tool calls
chloe chat --session my-session --yes

# Resume previous session
chloe chat --session my-session  # history loads automatically
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Shift+Enter` | Insert newline (requires Kitty-protocol terminal) |
| `Ctrl+J` | Insert newline (universal fallback) |
| `Ctrl+C` (×1) | Show exit prompt, clear input |
| `Ctrl+C` (×2) | Exit |
| `y` / `N` | Confirm / deny tool call (when tool block is active) |

## Status Bar

```
[my-session] claude-sonnet-4-6 | 1,234 / 200,000 tokens (0.6%) | streaming
```

Fields: `[session]` `model` `|` `used / limit tokens (pct%)` `|` `state`

## Installing Dependencies (for development)

```bash
cd packages/cli
bun add ink@^6.7.0 react ink-scroll-view
bun add -d @types/react
```

## Running Tests

```bash
bun test packages/cli/src/ui/
```
