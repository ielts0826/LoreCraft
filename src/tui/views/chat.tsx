import { Box, Text } from "ink";

import { Panel } from "../components/panel.js";
import type { CommandMessage } from "../model.js";
import { tuiTheme } from "../theme.js";

export function ChatView({ messages }: { messages: CommandMessage[] }) {
  const visibleMessages = messages.slice(-6);

  return (
    <Panel title="对话">
      <Box flexDirection="column">
        {visibleMessages.map((message) => (
          <Box key={message.id} flexDirection="column" marginBottom={1}>
            <Text color={message.role === "assistant" ? tuiTheme.gold : message.role === "user" ? tuiTheme.blue : tuiTheme.muted}>
              {message.title}
            </Text>
            <Text color={tuiTheme.text}>{message.body}</Text>
          </Box>
        ))}
      </Box>
    </Panel>
  );
}
