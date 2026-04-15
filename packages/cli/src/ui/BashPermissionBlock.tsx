import { Box, Text } from "ink";
import { SelectList } from "./SelectList.js";
import type { ConfirmResult } from "./types.js";

interface BashPermissionBlockProps {
  binaryName: string;
  onResult: (result: ConfirmResult) => void;
}

const OPTIONS: Array<{ value: ConfirmResult; label: string }> = [
  { value: "allow-once", label: "Allow once" },
  { value: "deny", label: "Deny" },
  { value: "allow-session", label: "Allow in this session" },
];

export function BashPermissionBlock({ binaryName, onResult }: BashPermissionBlockProps) {
  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
    >
      <Box gap={1}>
        <Text color="yellow" bold>
          Permission required
        </Text>
      </Box>
      <Box paddingLeft={1}>
        <Text>
          Allow bash command:{" "}
          <Text bold color="cyan">
            {binaryName}
          </Text>
        </Text>
      </Box>
      <Box marginTop={1} paddingLeft={1}>
        <SelectList options={OPTIONS} onSelect={onResult} isActive={true} />
      </Box>
    </Box>
  );
}
