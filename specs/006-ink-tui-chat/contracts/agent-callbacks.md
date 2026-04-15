# Contract: AgentCallbacks Extension

**Feature**: 006-ink-tui-chat
**Scope**: Additive change to `@chloe/core` — one new optional callback

---

## Change

Add `onUsage` to `AgentCallbacks` in `packages/core/src/agent/types.ts`:

```ts
// Current (unchanged fields omitted for brevity):
export interface AgentCallbacks {
  onToken?: (text: string) => void;
  onToolCall?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, output: string) => void;
  confirmTool?: (name: string, input: unknown) => Promise<boolean>;

  // NEW — called once per model turn, after stream completes:
  onUsage?: (usage: TurnUsage) => void;
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}
```

## Call Site

In `packages/core/src/agent/loop.ts`, immediately after `stream.finalMessage()`:

```ts
const finalMessage = await stream.finalMessage();
callbacks.onUsage?.({
  inputTokens: finalMessage.usage.input_tokens,
  outputTokens: finalMessage.usage.output_tokens,
  cacheReadTokens: finalMessage.usage.cache_read_input_tokens ?? 0,
  cacheCreationTokens: finalMessage.usage.cache_creation_input_tokens ?? 0,
});
```

## Guarantees

- `onUsage` is called once per model API call within the ReAct loop (including intermediate tool-use turns)
- Existing callers that don't provide `onUsage` are unaffected (optional field)
- No changes to any other core interface, class, or behaviour
