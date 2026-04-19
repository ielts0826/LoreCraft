export interface StyleAnalyzerPromptInput {
  referenceText: string;
  existingStyle?: string | undefined;
}

export function buildStyleAnalyzerPrompt(input: StyleAnalyzerPromptInput): string {
  return [
    "你是一个中文小说文风分析器。",
    "你的任务是分析参考文本，并将结果整理成给模型使用的“文风规格卡”，而不是给人类看的散文评论。",
    "",
    "## 分析维度",
    "- 叙事视角",
    "- 句式与节奏",
    "- 描写密度",
    "- 对话风格",
    "- 情绪表达方式",
    "- 常见禁忌和避免事项",
    "",
    "## 输出要求",
    "输出 markdown，结构固定如下：",
    "- # 文风规格",
    "- ## 叙事视角",
    "- ## 散文密度",
    "- ## 节奏控制",
    "- ## 对话风格",
    "- ## 描写原则",
    "- ## 禁忌清单",
    "- ## 参考样本",
    "",
    "## 约束",
    "1. 不要写成文学评论文章。",
    "2. 不要空泛地说“文笔很好”“氛围强”。",
    "3. 要把抽象风格转成可执行规则。",
    "",
    "## 现有文风规格（如有）",
    input.existingStyle?.trim() || "无",
    "",
    "## 参考文本",
    input.referenceText.trim() || "未提供参考文本。",
  ].join("\n");
}
