import { z } from "zod";

export interface Mention {
  id: string;
  timestamp: number;
  text: string;
  author: string;
  platform: string;
  url: string;
  brand: string;
}

export interface MentionPage {
  mentions: Mention[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  brand: string;
  retrievedAt: number;
}

export const mentionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type MentionQuery = z.infer<typeof mentionQuerySchema>;
