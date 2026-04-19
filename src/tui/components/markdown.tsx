import { Box, Text } from "ink";

import { tuiTheme } from "../theme.js";

export function Markdown({ content }: { content: string }) {
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line, index, items) => line.length > 0 || items[index - 1] !== "");

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => {
        if (line.startsWith("### ")) {
          return (
            <Text key={`${line}-${index}`} color={tuiTheme.gold} bold>
              {line.replace(/^### /u, "")}
            </Text>
          );
        }

        if (line.startsWith("## ")) {
          return (
            <Text key={`${line}-${index}`} color={tuiTheme.gold}>
              {line.replace(/^## /u, "")}
            </Text>
          );
        }

        if (line.startsWith("- ")) {
          return (
            <Text key={`${line}-${index}`} color={tuiTheme.text}>
              • {line.replace(/^- /u, "")}
            </Text>
          );
        }

        return (
          <Text key={`${line}-${index}`} color={tuiTheme.text}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
}

