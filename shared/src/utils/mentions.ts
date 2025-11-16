import type { Mention } from "../types/mentions.js";

export function dedupeMentions(mentions: Mention[]): Mention[] {
  const map = new Map<string, Mention>();

  for (const mention of mentions) {
    const key = `${mention.source}:${mention.id}`;
    if (!map.has(key)) {
      map.set(key, mention);
      continue;
    }

    const existing = map.get(key)!;
    const existingTime = Date.parse(existing.createdAt ?? "");
    const currentTime = Date.parse(mention.createdAt ?? "");

    if (!Number.isNaN(currentTime) && currentTime > existingTime) {
      map.set(key, mention);
    }
  }

  return Array.from(map.values());
}
