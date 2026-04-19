import { Box, Text, useInput, useStdout } from "ink";
import { useEffect, useRef, useState } from "react";

function renderLineContent(
  displayLine: string,
  lineIdx: number,
  originalFirstLine: string,
  disabled: boolean,
  commandValid: boolean,
) {
  const defaultColor = disabled ? ("gray" as const) : ("white" as const);

  if (disabled || lineIdx !== 0 || !commandValid) {
    return <Text color={defaultColor}>{displayLine}</Text>;
  }

  const spaceIdx = originalFirstLine.indexOf(" ");
  if (spaceIdx === -1) {
    // No args yet — entire line is the command name
    return <Text color="cyan">{displayLine}</Text>;
  }

  // Cursor char │ shifts the split point by 1 if it falls before the space
  const cursorIdx = displayLine.indexOf("│");
  const splitIdx = cursorIdx !== -1 && cursorIdx <= spaceIdx ? spaceIdx + 1 : spaceIdx;

  return (
    <>
      <Text color="cyan">{displayLine.slice(0, splitIdx)}</Text>
      <Text color={defaultColor}>{displayLine.slice(splitIdx)}</Text>
    </>
  );
}

interface InputAreaProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  disabled: boolean;
  exitPrompt: boolean;
  autocompleteActive: boolean;
  onTabComplete: () => void;
  commandValid: boolean;
}

export function InputArea({
  value,
  onChange,
  onSubmit,
  disabled,
  exitPrompt,
  autocompleteActive,
  onTabComplete,
  commandValid,
}: InputAreaProps) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;

  // Track cursor position within the value string
  const [cursor, setCursor] = useState(value.length);

  // When value is changed externally (e.g. Tab completion), move cursor to end.
  // ownChange is set to true before every onChange call we make ourselves so we
  // can distinguish our own changes from parent-driven changes.
  const ownChangeRef = useRef(false);
  useEffect(() => {
    if (!ownChangeRef.current) {
      setCursor(value.length);
    }
    ownChangeRef.current = false;
  }, [value]);

  // Wrap onChange to mark the change as internal before calling it
  const notifyChange = (next: string) => {
    ownChangeRef.current = true;
    onChange(next);
  };

  useInput(
    (input, key) => {
      if (disabled) return;

      // Ctrl+C handled in App — skip here
      if (key.ctrl && input === "c") return;

      if (key.return) {
        // Shift+Enter or Ctrl+J → insert newline
        if (key.shift || (key.ctrl && input === "j")) {
          const next = `${value.slice(0, cursor)}\n${value.slice(cursor)}`;
          notifyChange(next);
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
        notifyChange("");
        setCursor(0);
        return;
      }

      // Ctrl+J → insert newline (universal fallback for terminals without Kitty protocol)
      if (key.ctrl && input === "j") {
        const next = `${value.slice(0, cursor)}\n${value.slice(cursor)}`;
        notifyChange(next);
        setCursor(cursor + 1);
        return;
      }

      if (key.backspace || key.delete) {
        if (cursor === 0) return;
        const next = value.slice(0, cursor - 1) + value.slice(cursor);
        notifyChange(next);
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

      if (key.tab) {
        if (autocompleteActive) {
          onTabComplete();
        }
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        const next = value.slice(0, cursor) + input + value.slice(cursor);
        notifyChange(next);
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
            {renderLineContent(line, i, lines[0] ?? "", disabled, commandValid)}
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
