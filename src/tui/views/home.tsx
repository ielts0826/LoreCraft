import { Box, Text } from "ink";

import type { ProjectSnapshot } from "../model.js";
import { tuiTheme } from "../theme.js";

const LORECRAFT_LOGO = [
  " _                         ____            __ _   ",
  "| |    ___  _ __ ___       / ___|_ __ __ _ / _| |_ ",
  "| |   / _ \\| '__/ _ \\_____| |   | '__/ _` | |_| __|",
  "| |__| (_) | | |  __/_____| |___| | | (_| |  _| |_ ",
  "|_____\\___/|_|  \\___|      \\____|_|  \\__,_|_|  \\__|",
].join("\n");

export function HomeView({ snapshot }: { snapshot: ProjectSnapshot | null }) {
  return (
    <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <Text color={tuiTheme.gold}>{LORECRAFT_LOGO}</Text>
      <Box marginTop={1}>
        <Text color={tuiTheme.softGold}>Terminal fiction studio for long-form worlds</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={tuiTheme.muted}>
          {snapshot?.isProject ? `当前项目：${snapshot.name}` : "当前目录还不是 LoreCraft 项目"}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text color={tuiTheme.text}>输入 / 开始选择命令，输入 /model 配置模型。</Text>
        <Text color={tuiTheme.muted}>项目状态页可用 /status 或 /view dashboard 打开。</Text>
      </Box>
    </Box>
  );
}
