import type { TurnUsage } from "@chloe/core";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentHandle } from "../agent-handle.js";
import { ChatView } from "./ChatView.js";
import { InputArea } from "./InputArea.js";
import { StatusBar } from "./StatusBar.js";
import type { ChatMessage, TokenUsage, UIStatus } from "./types.js";
import { getContextLimit } from "./types.js";

interface AppProps {
  sessionId: string;
  modelName: string;
  autoConfirm: boolean;
  agent: AgentHandle;
}

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

export function App({ sessionId, modelName, autoConfirm, agent }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const contextLimit = getContextLimit(modelName);

  // Terminal size guard: require minimum 40 cols × 10 rows
  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  if (cols < 40 || rows < 10) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Terminal too small
        </Text>
        <Text color="gray">
          Minimum size: 40×10. Current: {cols}×{rows}
        </Text>
        <Text color="gray">Please resize your terminal and try again.</Text>
      </Box>
    );
  }

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<UIStatus>("idle");
  const [exitPrompt, setExitPrompt] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  });

  // Streaming buffer — accumulate tokens here, flush to state at 16ms intervals
  const streamingIdRef = useRef<string | null>(null);
  const bufferRef = useRef<string>("");

  // Tool confirmation promise resolver
  const confirmResolveRef = useRef<((v: boolean) => void) | null>(null);

  useEffect(() => {
    if (status !== "streaming") return;
    const id = setInterval(() => {
      const buf = bufferRef.current;
      const msgId = streamingIdRef.current;
      if (msgId === null || buf === "") return;
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: buf } : m)));
    }, 16);
    return () => clearInterval(id);
  }, [status]);

  const handleUsage = useCallback((usage: TurnUsage) => {
    setTokenUsage((prev) => ({
      inputTokens: prev.inputTokens + usage.inputTokens,
      outputTokens: prev.outputTokens + usage.outputTokens,
      cacheReadTokens: prev.cacheReadTokens + usage.cacheReadTokens,
      cacheCreationTokens: prev.cacheCreationTokens + usage.cacheCreationTokens,
    }));
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (status !== "idle" || text.trim() === "") return;
      setExitPrompt(false);

      const userMsg: ChatMessage = {
        id: makeId(),
        role: "user",
        content: text,
        state: "complete",
      };

      const assistantId = makeId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        state: "streaming",
      };

      streamingIdRef.current = assistantId;
      bufferRef.current = "";

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStatus("thinking");

      try {
        await agent.run(sessionId, text, {
          onToken: (tok: string) => {
            setStatus("streaming");
            bufferRef.current += tok;
          },
          onToolCall: (name: string, input: unknown) => {
            const toolId = makeId();
            const toolMsg: ChatMessage = {
              id: toolId,
              role: "tool",
              toolName: name,
              toolInput: input,
              content: "",
              state: autoConfirm ? "confirmed" : "pending",
            };
            setMessages((prev) => [...prev, toolMsg]);
          },
          onToolResult: (name: string, output: string) => {
            setMessages((prev) => {
              const idx = [...prev]
                .reverse()
                .findIndex(
                  (m) =>
                    m.role === "tool" &&
                    m.toolName === name &&
                    (m.state === "confirmed" || m.state === "pending"),
                );
              if (idx === -1) return prev;
              const realIdx = prev.length - 1 - idx;
              return prev.map((m, i) =>
                i === realIdx ? { ...m, toolOutput: output, state: "done" } : m,
              );
            });
          },
          ...(autoConfirm
            ? {}
            : {
                confirmTool: (_name: string, _input: unknown) =>
                  new Promise<boolean>((resolve) => {
                    confirmResolveRef.current = resolve;
                  }),
              }),
          onUsage: handleUsage,
        });

        // Flush final buffer content
        const finalContent = bufferRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: finalContent, state: "complete" } : m,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const errId = makeId();
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== assistantId),
          { id: errId, role: "assistant", content: `[Error] ${msg}`, state: "complete" },
        ]);
      } finally {
        streamingIdRef.current = null;
        bufferRef.current = "";
        setStatus("idle");
      }
    },
    [status, sessionId, agent, autoConfirm, handleUsage],
  );

  const handleToolConfirm = useCallback((confirmed: boolean) => {
    const resolve = confirmResolveRef.current;
    if (resolve === null) return;
    confirmResolveRef.current = null;
    const toolId = makeId();
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === "tool" && m.state === "pending");
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.map((m, i) =>
        i === realIdx ? { ...m, state: confirmed ? "confirmed" : "denied" } : m,
      );
    });
    // Suppress unused variable warning — toolId used as side-effect marker
    void toolId;
    resolve(confirmed);
  }, []);

  // Double Ctrl+C exit
  const lastCtrlCRef = useRef<number>(0);
  useInput(
    (_input, key) => {
      if (key.ctrl && _input === "c") {
        const now = Date.now();
        if (exitPrompt && now - lastCtrlCRef.current < 2000) {
          exit();
        } else {
          lastCtrlCRef.current = now;
          setExitPrompt(true);
          setInputValue("");
        }
      }
    },
    { isActive: true },
  );

  const pendingToolMessage = messages.find((m) => m.role === "tool" && m.state === "pending");

  return (
    <>
      <ChatView
        messages={messages}
        streamingId={streamingIdRef.current}
        onToolConfirm={handleToolConfirm}
        pendingToolId={pendingToolMessage?.id ?? null}
      />
      <InputArea
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        disabled={status !== "idle" || pendingToolMessage !== undefined}
        exitPrompt={exitPrompt}
      />
      <StatusBar
        sessionId={sessionId}
        modelName={modelName}
        tokenUsage={tokenUsage}
        contextLimit={contextLimit}
        status={status}
      />
    </>
  );
}
