import jiebaModule from "@node-rs/jieba";
import { dict, idf } from "@node-rs/jieba/dict.js";

export interface KeywordResult {
  keyword: string;
  weight: number;
}

interface JiebaLikeModule {
  Jieba: {
    withDict: (input: Uint8Array) => JiebaSegmenter;
  };
  TfIdf: {
    withDict: (input: Uint8Array) => TfIdfExtractor;
  };
}

const jieba = jiebaModule as unknown as JiebaLikeModule;

interface JiebaSegmenter {
  loadDict: (input: Uint8Array) => void;
  cut: (text: string, hmm?: boolean) => string[];
}

interface TfIdfExtractor {
  extractKeywords: (
    jiebaInstance: JiebaSegmenter,
    sentence: string,
    topK: number,
    allowedPos?: string[] | null,
  ) => Array<{ keyword: string; weight: number }>;
}

export class Tokenizer {
  private initialized = false;
  private readonly customWords = new Set<string>();
  private segmenter: JiebaSegmenter | null = null;
  private keywordExtractor: TfIdfExtractor | null = null;

  public init(): void {
    if (this.initialized) {
      return;
    }

    this.segmenter = jieba.Jieba.withDict(dict);
    this.keywordExtractor = jieba.TfIdf.withDict(idf);
    this.initialized = true;
  }

  public buildDictionary(words: Iterable<string>): void {
    this.ensureInitialized();
    for (const word of words) {
      this.addEntityWord(word);
    }
  }

  public tokenize(text: string): string {
    return this.cut(text).join(" ");
  }

  public tokenizeQuery(query: string): string {
    return this.tokenize(query);
  }

  public extractKeywords(text: string, topK = 20): KeywordResult[] {
    this.ensureInitialized();
    if (!text.trim()) {
      return [];
    }

    const results = this.keywordExtractor?.extractKeywords(this.getSegmenter(), text, topK, undefined) ?? [];
    const normalized = results.map((item) => ({
      keyword: item.keyword,
      weight: item.weight,
    }));

    if (normalized.length > 0) {
      return normalized;
    }

    return this.extractKeywordsFallback(text, topK);
  }

  public addEntityWord(name: string): void {
    this.ensureInitialized();
    const word = name.trim();
    if (!word || this.customWords.has(word)) {
      return;
    }

    this.customWords.add(word);
    this.getSegmenter().loadDict(Buffer.from(`${word} 1000 n\n`, "utf8"));
  }

  private cut(text: string): string[] {
    this.ensureInitialized();
    const trimmed = text.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const tokens = splitByCustomWords(trimmed, this.customWords).flatMap((segment) => {
        if (this.customWords.has(segment)) {
          return [segment];
        }

        return this.getSegmenter()
          .cut(segment, true)
          .map((token) => token.trim())
          .filter(Boolean);
      });
      return tokens.length > 0 ? tokens : this.fallbackCut(trimmed);
    } catch {
      return this.fallbackCut(trimmed);
    }
  }

  private fallbackCut(text: string): string[] {
    return text
      .split(/[\s,.;:!?，。；：！？()[\]{}<>《》【】"'“”‘’、/\\|+-]+/u)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  private extractKeywordsFallback(text: string, topK: number): KeywordResult[] {
    const frequency = new Map<string, number>();
    for (const token of this.cut(text)) {
      if (token.length < 2) {
        continue;
      }
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }

    return [...frequency.entries()]
      .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
      .slice(0, topK)
      .map(([keyword, count]) => ({
        keyword,
        weight: count,
      }));
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("Tokenizer not initialized. Call init() first.");
    }
  }

  private getSegmenter(): JiebaSegmenter {
    this.ensureInitialized();
    if (this.segmenter === null) {
      throw new Error("Tokenizer segmenter is not available.");
    }

    return this.segmenter;
  }
}

function splitByCustomWords(text: string, customWords: Set<string>): string[] {
  if (customWords.size === 0) {
    return [text];
  }

  const orderedWords = [...customWords].sort((left, right) => right.length - left.length);
  const segments: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const matchedWord = orderedWords.find((word) => text.startsWith(word, cursor));
    if (matchedWord) {
      segments.push(matchedWord);
      cursor += matchedWord.length;
      continue;
    }

    let nextCursor = cursor + 1;
    while (
      nextCursor < text.length &&
      !orderedWords.some((word) => text.startsWith(word, nextCursor))
    ) {
      nextCursor += 1;
    }

    segments.push(text.slice(cursor, nextCursor));
    cursor = nextCursor;
  }

  return segments.filter(Boolean);
}
