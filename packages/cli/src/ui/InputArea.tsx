import { Box, Text, useInput, useStdout } from "ink";
import { useState } from "react";

interface InputAreaProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  disabled: boolean;
  exitPrompt: boolean;
}

export function InputArea({ value, onChange, onSubmit, disabled, exitPrompt }: InputAreaProps) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  // Track cursor position within the value string
  const [cursor, setCursor] = useState(value.length);

  useInput(
    (input, key) => {
      if (disabled) return;

      // Ctrl+C handled in App — skip here
      if (key.ctrl && input === "c") return;

      if (key.return) {
        // Shift+Enter or Ctrl+J → insert newline
        if (key.shift || (key.ctrl && input === "j")) {
          const next = `${value.slice(0, cursor)}\n${value.slice(cursor)}`;
          onChange(next);
          setCursor(cursor + 1);
          return;
        }
        // Enter → submit
        const trimmed = value.trim();
        if (trimmed === "") return;
        if (trimmed === "exit") {
          process.exit(0);
        }
        onSubmit(value);
        onChange("");
        setCursor(0);
        return;
      }

      // Ctrl+J → insert newline (universal fallback for terminals without Kitty protocol)
      if (key.ctrl && input === "j") {
        const next = `${value.slice(0, cursor)}\n${value.slice(cursor)}`;
        onChange(next);
        setCursor(cursor + 1);
        return;
      }

      if (key.backspace || key.delete) {
        if (cursor === 0) return;
        const next = value.slice(0, cursor - 1) + value.slice(cursor);
        onChange(next);
        setCursor(cursor - 1);
        return;
      }

      if (key.leftArrow) {
        setCursor(Math.max(0, cursor - 1));
        return;
      }

      if (key.rightArrow) {
        setCursor(Math.min(value.length, cursor + 1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        const next = value.slice(0, cursor) + input + value.slice(cursor);
        onChange(next);
        setCursor(cursor + input.length);
      }
    },
    { isActive: !disabled },
  );

  // Render multi-line value, splitting by \n
  const lines = value.split("\n");

  // Build display lines with cursor indicator
  const displayLines = lines.map((line, lineIdx) => {
    const lineStart = lines.slice(0, lineIdx).reduce((acc, l) => acc + l.length + 1, 0);
    const lineEnd = lineStart + line.length;
    if (cursor >= lineStart && cursor <= lineEnd) {
      const pos = cursor - lineStart;
      return `${line.slice(0, pos)}│${line.slice(pos)}`;
    }
    return line;
  });

  const prompt = disabled ? "  " : "> ";

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={disabled ? "gray" : "white"}
      width={cols}
    >
      {exitPrompt && (
        <Box paddingX={1}>
          <Text color="yellow">Press Ctrl+C again to exit</Text>
        </Box>
      )}
      <Box flexDirection="column" paddingX={1}>
        {displayLines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: display lines are purely positional, never reordered
          <Box key={i}>
            <Text color="gray">{i === 0 ? prompt : "  "}</Text>
            <Text color={disabled ? "gray" : "white"}>{line}</Text>
          </Box>
        ))}
        {displayLines.length === 0 && (
          <Box>
            <Text color="gray">{prompt}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
