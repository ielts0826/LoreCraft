import { Box, Text } from "ink";

import { tuiTheme } from "../theme.js";

export interface ScrollListItem {
  label: string;
  meta?: string;
  tone?: "normal" | "muted" | "danger" | "success";
}

export function ScrollList({
  items,
  activeIndex = 0,
  maxItems = 8,
}: {
  items: ScrollListItem[];
  activeIndex?: number;
  maxItems?: number;
}) {
  const visible = items.slice(0, maxItems);

  return (
    <Box flexDirection="column">
      {visible.map((item, index) => {
        const color =
          item.tone === "danger"
            ? tuiTheme.danger
            : item.tone === "success"
              ? tuiTheme.success
              : item.tone === "muted"
                ? tuiTheme.muted
                : tuiTheme.text;

        return (
          <Box key={`${item.label}-${index}`} justifyContent="space-between">
            <Text color={index === activeIndex ? tuiTheme.gold : color}>
              {index === activeIndex ? "› " : "  "}
              {item.label}
            </Text>
            {item.meta ? <Text color={tuiTheme.muted}>{item.meta}</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
}

