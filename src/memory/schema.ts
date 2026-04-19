import { z } from "zod";

export const canonCategorySchema = z.enum([
  "world",
  "character",
  "faction",
  "location",
  "resource",
  "creature",
]);

export const canonEntrySchema = z.object({
  name: z.string().min(1),
  category: canonCategorySchema,
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  filePath: z.string().min(1),
  content: z.string(),
  lastModified: z.date(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const outlineTypeSchema = z.enum(["master", "volume", "chapter"]);

export const outlineSchema = z.object({
  id: z.string().min(1),
  type: outlineTypeSchema,
  content: z.string(),
  filePath: z.string().min(1),
  lastModified: z.date(),
});

export const foreshadowingSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  plantedIn: z.string().min(1),
  status: z.enum(["open", "resolved"]).default("open"),
  resolution: z.string().optional(),
});

export const contradictionEntrySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  location: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
  createdAt: z.date(),
});

export const styleBundleSchema = z.object({
  proseStyle: z.string(),
  povRules: z.string(),
  tabooList: z.string(),
});

export const mentionTypeSchema = z.enum([
  "character",
  "location",
  "resource",
  "creature",
  "faction",
  "term",
]);

export const mentionRecordSchema = z.object({
  entityName: z.string().min(1),
  entityType: mentionTypeSchema,
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  firstChapter: z.string().min(1),
  lastChapter: z.string().min(1),
  occurrences: z.number().int().positive(),
  canonFile: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const retrievalRuleSchema = z.object({
  type: z.enum([
    "prioritize_current_volume",
    "canon_over_draft",
    "latest_confirmed",
    "deprioritize_deprecated",
  ]),
  weight: z.number(),
  value: z.string().optional(),
});

export const retrievalQuerySchema = z.object({
  text: z.string(),
  layers: z.array(z.enum(["canon", "outline", "continuity", "manuscript"])).optional(),
  categories: z.array(z.string()).optional(),
  maxResults: z.number().int().positive().default(10),
  minScore: z.number().default(0),
  useVector: z.boolean().default(true),
  useBM25: z.boolean().default(true),
  useStructure: z.boolean().default(true),
  queryEmbedding: z.array(z.number()).optional(),
  weights: z
    .object({
      bm25: z.number().default(0.4),
      vector: z.number().default(0.4),
      structure: z.number().default(0.2),
    })
    .default({
      bm25: 0.4,
      vector: 0.4,
      structure: 0.2,
    }),
  rules: z.array(retrievalRuleSchema).default([]),
});

export const retrievalResultSchema = z.object({
  source: z.string().min(1),
  layer: z.string().min(1),
  category: z.string().min(1),
  content: z.string(),
  score: z.number(),
  matchType: z.enum(["bm25", "vector", "structure", "hybrid", "fallback"]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CanonCategory = z.infer<typeof canonCategorySchema>;
export type CanonEntry = z.infer<typeof canonEntrySchema>;
export type Outline = z.infer<typeof outlineSchema>;
export type OutlineType = z.infer<typeof outlineTypeSchema>;
export type Foreshadowing = z.infer<typeof foreshadowingSchema>;
export type ContradictionEntry = z.infer<typeof contradictionEntrySchema>;
export type StyleBundle = z.infer<typeof styleBundleSchema>;
export type MentionType = z.infer<typeof mentionTypeSchema>;
export type MentionRecord = z.infer<typeof mentionRecordSchema>;
export type RetrievalQueryInput = z.input<typeof retrievalQuerySchema>;
export type RetrievalRule = z.infer<typeof retrievalRuleSchema>;
export type RetrievalQuery = z.infer<typeof retrievalQuerySchema>;
export type RetrievalResult = z.infer<typeof retrievalResultSchema>;
