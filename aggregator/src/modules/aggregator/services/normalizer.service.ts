import type { NormalizedMention, RawMention } from "../types/mention.js";

export class MentionNormalizerService {
  normalize(raw: RawMention, brand: string): NormalizedMention {
    const timestampMs = typeof raw.timestamp === "number"
      ? raw.timestamp
      : new Date(raw.timestamp).getTime();

    return {
      id: raw.id,
      brand,
      text: raw.text.trim(),
      timestamp: Number.isFinite(timestampMs) ? timestampMs : Date.now(),
      source: raw.platform,
      metadata: {
        author: raw.author || "unknown",
        url: raw.url,
        raw: raw.raw,
      },
    };
  }
}
