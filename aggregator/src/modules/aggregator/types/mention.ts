export type MentionPlatform = "reddit" | "x" | "news" | "rss";

export interface MentionMetadata {
  author: string;
  url: string;
  raw: unknown;
  [key: string]: unknown;
}

export interface NormalizedMention {
  id: string;
  brand: string;
  text: string;
  timestamp: number;
  source: MentionPlatform;
  metadata: MentionMetadata;
}

export interface RawMention {
  id: string;
  timestamp: string | number;
  text: string;
  author: string;
  url: string;
  raw: unknown;
  platform: MentionPlatform;
}
