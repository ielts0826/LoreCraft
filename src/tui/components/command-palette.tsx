import { Box, Text } from "ink";

import type { PaletteItem } from "../palette.js";
import { tuiTheme } from "../theme.js";

export function CommandPalette({
  items,
  activeIndex,
  showDescription = false,
}: {
  items: readonly PaletteItem[];
  activeIndex: number;
  showDescription?: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={tuiTheme.border} paddingX={1}>
      {items.slice(0, 8).map((item) => {
        const selected = items.indexOf(item) === activeIndex;
        return (
          <Box key={item.id} flexDirection="column">
            <Text color={selected ? tuiTheme.gold : tuiTheme.text}>
              {selected ? "> " : "  "}
              {item.label}
            </Text>
            {showDescription ? <Text color={tuiTheme.muted}>{item.description}</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
}
