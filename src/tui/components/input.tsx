import { Box, Text } from "ink";

import { tuiTheme } from "../theme.js";

export function CommandInput({
  value,
  placeholder,
  focused = true,
}: {
  value: string;
  placeholder: string;
  focused?: boolean;
}) {
  const displayValue = value.length > 0 ? value : placeholder;

  return (
    <Box flexDirection="row" alignItems="center">
      <Text color={tuiTheme.blue}>{focused ? "▎" : " "}</Text>
      <Box flexGrow={1} borderStyle="single" borderColor={tuiTheme.border} paddingX={1}>
        <Text color={value.length > 0 ? tuiTheme.text : tuiTheme.muted}>
          {displayValue}
          {focused ? "█" : ""}
        </Text>
      </Box>
    </Box>
  );
}

