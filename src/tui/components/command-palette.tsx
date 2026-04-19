import { Box, Text } from "ink";

import type { TuiCommandSpec } from "../commands.js";
import { tuiTheme } from "../theme.js";

export function CommandPalette({
  commands,
  activeIndex,
}: {
  commands: readonly TuiCommandSpec[];
  activeIndex: number;
}) {
  if (commands.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={tuiTheme.border} paddingX={1}>
      {commands.slice(0, 8).map((command, index) => {
        const selected = index === activeIndex;
        return (
          <Box key={command.name} flexDirection="column" marginBottom={index === commands.length - 1 ? 0 : 1}>
            <Text color={selected ? tuiTheme.gold : tuiTheme.text}>
              {selected ? "> " : "  "}
              {command.synopsis}
            </Text>
            <Text color={tuiTheme.muted}>{command.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
