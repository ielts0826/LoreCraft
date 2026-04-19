import path from "node:path";

export const PATHS = {
  storyBible: "story_bible",
  canon: "story_bible/canon",
  characters: "story_bible/canon/characters",
  world: "story_bible/canon/world",
  locations: "story_bible/canon/world/locations",
  factions: "story_bible/canon/factions",
  outlines: "story_bible/outlines",
  volumePlans: "story_bible/outlines/volume_plans",
  chapterBriefs: "story_bible/outlines/chapter_briefs",
  continuity: "story_bible/continuity",
  style: "story_bible/style",
  proseStyle: "story_bible/style/prose_style.md",
  povRules: "story_bible/style/pov_rules.md",
  tabooList: "story_bible/style/taboo_list.md",
  openLoops: "story_bible/continuity/open_loops.md",
  resolvedLoops: "story_bible/continuity/resolved_loops.md",
  contradictionLog: "story_bible/continuity/contradiction_log.md",
  premise: "story_bible/outlines/premise.md",
  masterOutline: "story_bible/outlines/master_outline.md",
  timeline: "story_bible/canon/timeline.md",
  glossary: "story_bible/canon/glossary.md",
  manuscript: "manuscript",
  volumes: "manuscript/volumes",
  agent: ".agent",
  agentMemory: ".agent/memory",
  sessionSummaries: ".agent/memory/session_summaries",
  decisionLog: ".agent/memory/decision_log",
  mentionIndex: ".agent/memory/mention_index.sqlite",
  retrievalIndex: ".agent/memory/retrieval_index.sqlite",
  transactions: ".agent/transactions",
  cache: ".agent/cache",
  audit: ".agent/audit",
  config: ".agent/config.yaml",
} as const;

export type ProjectPathKey = keyof typeof PATHS;

export function projectPath(root: string, key: ProjectPathKey): string {
  return path.join(root, PATHS[key]);
}

export const PROJECT_DIRECTORIES: readonly ProjectPathKey[] = [
  "storyBible",
  "canon",
  "characters",
  "world",
  "locations",
  "factions",
  "outlines",
  "volumePlans",
  "chapterBriefs",
  "continuity",
  "style",
  "manuscript",
  "volumes",
  "agent",
  "agentMemory",
  "sessionSummaries",
  "decisionLog",
  "transactions",
  "cache",
  "audit",
];

export const DEFAULT_TEXT_FILES: Readonly<Record<ProjectPathKey, string>> = {
  proseStyle: `# 文风规格

## 叙事视角
- 视角: 第三人称有限视角
- 视角切换: 单章内不切换

## 节奏
- 开头要有钩子
- 结尾保留悬念或情绪张力
`,
  povRules: `# POV 规则

- 默认贴近当前主视角人物
- 不在同一场景中跨角色跳视角
`,
  tabooList: `# 禁忌清单

- 不写大段硬解释
- 不让角色互相解释双方都知道的信息
`,
  openLoops: "# 未回收伏笔\n",
  resolvedLoops: "# 已回收伏笔\n",
  contradictionLog: "# 冲突日志\n",
  premise: "# 故事前提\n",
  masterOutline: "# 总纲\n",
  timeline: "# 时间线\n",
  glossary: "# 术语表\n",
  storyBible: "",
  canon: "",
  characters: "",
  world: "",
  locations: "",
  factions: "",
  outlines: "",
  volumePlans: "",
  chapterBriefs: "",
  continuity: "",
  style: "",
  manuscript: "",
  volumes: "",
  agent: "",
  agentMemory: "",
  sessionSummaries: "",
  decisionLog: "",
  mentionIndex: "",
  retrievalIndex: "",
  transactions: "",
  cache: "",
  audit: "",
  config: "",
};
