import type { RouterOptions, TurnUsage } from "@chloe/core";
import { routeCommand } from "@chloe/core";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentHandle } from "../agent-handle.js";
import { BashPermissionBlock } from "./BashPermissionBlock.js";
import { ChatView } from "./ChatView.js";
import { InputArea } from "./InputArea.js";
import { StatusBar } from "./StatusBar.js";
import type { ChatMessage, ConfirmResult, TokenUsage, UIStatus } from "./types.js";
import { getContextLimit } from "./types.js";

interface AppProps {
  sessionId: string;
  modelName: string;
  autoConfirm: boolean;
  agent: AgentHandle;
  initialMessages?: ChatMessage[];
  globalSkillsDir: string;
  projectSkillsDir: string;
}

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

const BASH_TOOL_NAME = "bash";

export function App({
  sessionId,
  modelName,
  autoConfirm,
  agent,
  initialMessages,
  globalSkillsDir,
  projectSkillsDir,
}: AppProps) {
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

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [status, setStatus] = useState<UIStatus>("idle");
  const [exitPrompt, setExitPrompt] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [sessionAllowedTools, setSessionAllowedTools] = useState<Set<string>>(new Set());
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  });
  const [pendingBashBinary, setPendingBashBinary] = useState<string | null>(null);
  const [sessionAllowedBinaries, setSessionAllowedBinaries] = useState<Set<string>>(new Set());
  const bashPermissionResolveRef = useRef<((allowed: boolean) => void) | null>(null);

  // Streaming buffer — accumulate tokens here, flush to state at 16ms intervals
  const streamingIdRef = useRef<string | null>(null);
  const bufferRef = useRef<string>("");

  // Tool confirmation promise resolver
  const confirmResolveRef = useRef<((result: ConfirmResult) => void) | null>(null);

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

  const confirmBashCommand = useCallback(
    async (binaryName: string): Promise<boolean> => {
      if (sessionAllowedBinaries.has(binaryName)) return true;
      return new Promise<boolean>((resolve) => {
        bashPermissionResolveRef.current = resolve;
        setPendingBashBinary(binaryName);
      });
    },
    [sessionAllowedBinaries],
  );

  const handleBashPermission = useCallback(
    (result: ConfirmResult) => {
      const resolve = bashPermissionResolveRef.current;
      if (resolve === null) return;
      bashPermissionResolveRef.current = null;
      if (result === "allow-session" && pendingBashBinary !== null) {
        setSessionAllowedBinaries((prev) => new Set([...prev, pendingBashBinary]));
      }
      setPendingBashBinary(null);
      resolve(result !== "deny");
    },
    [pendingBashBinary],
  );

  const handleSubmit = useCallback(
    async (text: string) => {
      if (status !== "idle" || text.trim() === "") return;
      setExitPrompt(false);

      const routerOpts: RouterOptions = { globalSkillsDir, projectSkillsDir };
      const routeResult = await routeCommand(text, routerOpts);

      if (routeResult.kind === "internal") {
        const internalId = makeId();
        const userMsg: ChatMessage = {
          id: makeId(),
          role: "user",
          content: text,
          state: "complete",
        };
        const internalMsg: ChatMessage = {
          id: internalId,
          role: "assistant",
          content: routeResult.output,
          state: "complete",
        };
        setMessages((prev) => [...prev, userMsg, internalMsg]);
        return;
      }

      if (routeResult.kind === "error") {
        const errId = makeId();
        const userMsg: ChatMessage = {
          id: makeId(),
          role: "user",
          content: text,
          state: "complete",
        };
        const errMsg: ChatMessage = {
          id: errId,
          role: "assistant",
          content: routeResult.message,
          state: "complete",
        };
        setMessages((prev) => [...prev, userMsg, errMsg]);
        return;
      }

      const messageToSend = routeResult.kind === "skill" ? routeResult.expandedContent : text;

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
        await agent.run(sessionId, messageToSend, {
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
              state: autoConfirm || name === BASH_TOOL_NAME ? "confirmed" : "pending",
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
                    (m.state === "confirmed" ||
                      m.state === "pending" ||
                      m.state === "session-allowed"),
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
                confirmTool: async (name: string, _input: unknown): Promise<boolean> => {
                  if (name === BASH_TOOL_NAME) return true;
                  if (sessionAllowedTools.has(name)) return true;
                  const result = await new Promise<ConfirmResult>((resolve) => {
                    confirmResolveRef.current = resolve;
                  });
                  return result !== "deny";
                },
                confirmBashCommand,
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
    [
      status,
      sessionId,
      agent,
      autoConfirm,
      handleUsage,
      sessionAllowedTools,
      confirmBashCommand,
      globalSkillsDir,
      projectSkillsDir,
    ],
  );

  const handleToolConfirm = useCallback(
    (result: ConfirmResult) => {
      const resolve = confirmResolveRef.current;
      if (resolve === null) return;
      confirmResolveRef.current = null;

      if (result === "allow-session") {
        const pending = messages.find((m) => m.role === "tool" && m.state === "pending");
        if (pending?.toolName) {
          setSessionAllowedTools((s) => new Set([...s, pending.toolName as string]));
        }
      }

      setMessages((prev) => {
        const idx = [...prev]
          .reverse()
          .findIndex((m) => m.role === "tool" && m.state === "pending");
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const newState: import("./types.js").MessageState =
          result === "allow-once"
            ? "confirmed"
            : result === "allow-session"
              ? "session-allowed"
              : "denied";
        return prev.map((m, i) => (i === realIdx ? { ...m, state: newState } : m));
      });

      resolve(result);
    },
    [messages],
  );

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
      {pendingBashBinary !== null && (
        <BashPermissionBlock binaryName={pendingBashBinary} onResult={handleBashPermission} />
      )}
      <InputArea
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        disabled={
          status !== "idle" || pendingToolMessage !== undefined || pendingBashBinary !== null
        }
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
