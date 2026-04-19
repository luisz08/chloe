import { Box, Text, useInput } from "ink";

export interface PaletteItem {
  name: string;
  description: string;
  isCommand: boolean;
}

interface CommandPaletteProps {
  items: PaletteItem[];
  selectedIndex: number;
  onSelectedIndexChange: (i: number) => void;
  onSubmit: (name: string) => void;
  isActive: boolean;
}

const MAX_VISIBLE = 8;

export function CommandPalette({
  items,
  selectedIndex,
  onSelectedIndexChange,
  onSubmit,
  isActive,
}: CommandPaletteProps) {
  const visible = items.slice(0, MAX_VISIBLE);
  const overflow = items.length - MAX_VISIBLE;

  useInput(
    (_, key) => {
      if (key.upArrow) {
        onSelectedIndexChange((selectedIndex - 1 + items.length) % items.length);
      } else if (key.downArrow) {
        onSelectedIndexChange((selectedIndex + 1) % items.length);
      } else if (key.return) {
        const item = items[selectedIndex];
        if (item) onSubmit(item.name);
      }
    },
    { isActive: isActive && items.length > 0 },
  );

  if (items.length === 0) return null;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {visible.map((item, i) => {
        const isSelected = i === selectedIndex;
        const label = item.isCommand ? "[cmd]  " : "[skill]";
        return (
          <Box key={item.name} gap={1}>
            <Text color={isSelected ? "cyan" : "gray"}>{isSelected ? "▶" : " "}</Text>
            <Text color={isSelected ? "cyan" : "white"} bold={isSelected}>
              {`/${item.name}`}
            </Text>
            <Text color="#87CEEB">{label}</Text>
            <Text color={isSelected ? "white" : "gray"} dimColor={!isSelected}>
              {item.description}
            </Text>
          </Box>
        );
      })}
      {overflow > 0 && (
        <Text color="gray" dimColor>
          {"  "}...{overflow} more (keep typing to filter)
        </Text>
      )}
    </Box>
  );
}
