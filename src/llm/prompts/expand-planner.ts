export interface ExpandPlannerPromptInput {
  outlineText: string;
  existingCanon: string;
  openLoops?: string | undefined;
  genreTemplate?: string | undefined;
}

export function buildExpandPlannerPrompt(input: ExpandPlannerPromptInput): string {
  return [
    "你是 LoreCraft 的分卷扩展规划器。",
    "你的任务是比较“当前卷大纲”与“已有 canon”，找出真正的设定缺口，并按依赖顺序提出增量扩展计划。",
    "",
    "## 核心原则",
    "1. 只补缺口，不重复生成已有设定。",
    "2. 如果大纲要求修改既有设定，要明确标记为高风险更新。",
    "3. 输出要强调依赖顺序，先体系和地点，再人物、势力、资源、伏笔。",
    "",
    "## 输出格式",
    "输出中文 markdown，必须包含：",
    "- 差异分析结果",
    "- 缺口清单",
    "- 风险等级标记（[!] 新建 / [~] 修改）",
    "- 建议生成顺序",
    "",
    "## 已有 canon",
    input.existingCanon.trim() || "未提供已有 canon。",
    "",
    "## 当前未回收伏笔",
    input.openLoops?.trim() || "未提供未回收伏笔。",
    "",
    "## 类型模板",
    input.genreTemplate?.trim() || "未提供类型模板。",
    "",
    "## 本卷大纲",
    input.outlineText.trim() || "未提供卷大纲。",
  ].join("\n");
}
