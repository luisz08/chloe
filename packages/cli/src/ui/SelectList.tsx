import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";

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

  // Reset index when the options list changes length to avoid stale/out-of-bounds index.
  // biome-ignore lint/correctness/useExhaustiveDependencies: options.length is the intentional dependency
  useEffect(() => {
    setIndex(0);
  }, [options.length]);

  useInput(
    (_, key) => {
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
          {/* Spread form used so no `color` prop is passed when the item is not selected,
              letting Ink use its default text color rather than an explicit value. */}
          <Text {...(i === index ? { color: "cyan" as const } : {})}>
            {i === index ? "▶" : " "}
          </Text>
          <Text color={i === index ? "cyan" : "gray"}>{opt.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
