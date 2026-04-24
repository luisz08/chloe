import { Box, Text } from "ink";
import pkg from "../../package.json";

const LOGO_LINES = [
  " ██████╗██╗  ██╗██╗      ██████╗ ███████╗",
  "██╔════╝██║  ██║██║     ██╔═══██╗██╔════╝",
  "██║     ███████║██║     ██║   ██║█████╗  ",
  "██║     ██╔══██║██║     ██║   ██║██╔══╝  ",
  "╚██████╗██║  ██║███████╗╚██████╔╝███████╗",
  " ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚══════╝",
];

interface ChloeHeaderProps {
  modelName: string;
}

export function ChloeHeader({ modelName }: ChloeHeaderProps) {
  return (
    <Box flexDirection="column" marginTop={1} marginLeft={2} marginBottom={1}>
      {LOGO_LINES.map((line) => (
        <Text key={line} color="cyan">
          {line}
        </Text>
      ))}
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="gray">Model: </Text>
          <Text>{modelName}</Text>
        </Text>
        <Text>
          <Text color="gray">Version: </Text>
          <Text>v{pkg.version}</Text>
        </Text>
      </Box>
    </Box>
  );
}
