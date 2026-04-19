import { Box, Text } from "ink";

import type { PaletteItem } from "../palette.js";
import { tuiTheme } from "../theme.js";

export function CommandPalette({
  items,
  activeIndex,
}: {
  items: readonly PaletteItem[];
  activeIndex: number;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={tuiTheme.border} paddingX={1}>
      {items.slice(0, 8).map((item, index) => {
        const selected = index === activeIndex;
        return (
          <Box key={item.id} flexDirection="column" marginBottom={index === items.length - 1 ? 0 : 1}>
            <Text color={selected ? tuiTheme.gold : tuiTheme.text}>
              {selected ? "> " : "  "}
              {item.label}
            </Text>
            <Text color={tuiTheme.muted}>{item.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
