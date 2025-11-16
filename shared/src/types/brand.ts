import type { Mention } from "./mentions.js";

export interface Brand {
  id: string;
  name: string;
  keywords: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BrandWithMentions extends Brand {
  mentions: Mention[];
}

export interface BrandConfig {
  brands: Brand[];
}

export interface BrandChunkMetadata {
  brand: string;
  chunkId: string;
  chunkIndex: number;
  totalChunks: number;
  retryCount: number;
  createdAt: string;
}

export interface AddBrandPayload {
  name: string;
  keywords: string[];
}

