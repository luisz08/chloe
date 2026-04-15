import { Box, Text, useInput } from "ink";
import { useState } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectListProps<T extends string> {
  options: SelectOption<T>[];
  onSelect: (value: T) => void;
  isActive: boolean;
}

export function SelectList<T extends string>({ options, onSelect, isActive }: SelectListProps<T>) {
  const [index, setIndex] = useState(0);

  useInput(
    (_, key) => {
      if (!isActive) return;
      if (key.upArrow) {
        setIndex((i) => (i - 1 + options.length) % options.length);
      } else if (key.downArrow) {
        setIndex((i) => (i + 1) % options.length);
      } else if (key.return) {
        const opt = options[index];
        if (opt) onSelect(opt.value);
      }
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      {options.map((opt, i) => (
        <Box key={opt.value} gap={1}>
          <Text {...(i === index ? { color: "cyan" as const } : {})}>
            {i === index ? "▶" : " "}
          </Text>
          <Text color={i === index ? "cyan" : "gray"}>{opt.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
