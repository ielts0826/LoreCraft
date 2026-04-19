export interface ExtractorPromptInput {
  chapterText: string;
  canonIndex: string;
  mentionIndexSummary: string;
  candidateEntities?: string[] | undefined;
  timeline: string;
}

export function buildExtractorSystemPrompt(input: ExtractorPromptInput): string {
  const candidateLine =
    input.candidateEntities && input.candidateEntities.length > 0
      ? input.candidateEntities.join("、")
      : "无";

  return [
    "你是一个小说知识提取引擎。",
    "你的任务是从刚完成的章节中提取：新实体、已有实体状态变更、伏笔新增或回收、时间推进。",
    "",
    "## 提取原则",
    "1. 只提取有正文证据支持的信息。",
    "2. 不把暂时的描写误判为正式 canon。",
    "3. 对首次出现但未形成核心设定的内容，优先落入 silent_tracking。",
    "4. 对反复出现且形成明确设定的内容，才提出升级建议。",
    "",
    "## 严格输出格式",
    "只输出 JSON，不要输出 markdown，不要输出解释。",
    "JSON 结构：",
    "{",
    '  "silent_tracking": [],',
    '  "upgrade_proposals": [],',
    '  "entity_updates": [],',
    '  "new_foreshadowing": [],',
    '  "resolved_foreshadowing": [],',
    '  "timeline_update": {}',
    "}",
    "",
    "## 现有 canon 实体索引",
    input.canonIndex.trim() || "未提供现有 canon 索引。",
    "",
    "## mention index 摘要",
    input.mentionIndexSummary.trim() || "未提供 mention index 摘要。",
    "",
    "## 候选实体提示",
    candidateLine,
    "",
    "## 当前时间线",
    input.timeline.trim() || "未提供时间线。",
    "",
    "## 章节正文",
    input.chapterText.trim() || "未提供章节正文。",
  ].join("\n");
}
