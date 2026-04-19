import { Box, Text } from "ink";
import type { PropsWithChildren } from "react";

import { tuiTheme } from "../theme.js";

interface PanelProps extends PropsWithChildren {
  title: string;
  accent?: "gold" | "blue" | "danger" | "success";
}

export function Panel({ title, accent = "gold", children }: PanelProps) {
  const borderColor =
    accent === "blue"
      ? tuiTheme.blue
      : accent === "danger"
        ? tuiTheme.danger
        : accent === "success"
          ? tuiTheme.success
          : tuiTheme.softGold;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} paddingY={0}>
      <Box marginBottom={1}>
        <Text color={borderColor}>{title}</Text>
      </Box>
      {children}
    </Box>
  );
}

