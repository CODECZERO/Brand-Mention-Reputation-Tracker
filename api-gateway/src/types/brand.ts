import { z } from "zod";

export interface BrandKeyword {
  id: string;
  value: string;
  createdAt: number;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  rssFeeds: string[];
  keywords: BrandKeyword[];
  createdAt: number;
  updatedAt: number;
}

export const brandCreateSchema = z.object({
  name: z.string().min(1, "name is required"),
  aliases: z.array(z.string().min(1)).optional(),
  rssFeeds: z.array(z.string().url("rssFeeds entries must be valid URLs")).optional(),
  keywords: z.array(z.string().min(1)).optional(),
});

export type BrandCreateInput = z.infer<typeof brandCreateSchema>;

export const brandUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)).optional(),
  rssFeeds: z.array(z.string().url("rssFeeds entries must be valid URLs")).optional(),
  keywords: z.array(z.string().min(1)).optional(),
});

export type BrandUpdateInput = z.infer<typeof brandUpdateSchema>;

export const keywordCreateSchema = z.object({
  value: z.string().min(1, "keyword value is required"),
});

export type KeywordCreateInput = z.infer<typeof keywordCreateSchema>;
