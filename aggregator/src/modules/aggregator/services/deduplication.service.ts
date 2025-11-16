import crypto from "node:crypto";
import { logger } from "../../../utils/logger.js";
import type { NormalizedMention } from "../types/mention.js";

export interface DeduplicationResult {
  unique: NormalizedMention[];
  duplicates: NormalizedMention[];
}

export class MentionDeduplicationService {
  constructor(private readonly seenIds: Set<string> = new Set()) {}

  deduplicate(mentions: NormalizedMention[]): DeduplicationResult {
    const unique: NormalizedMention[] = [];
    const duplicates: NormalizedMention[] = [];

    for (const mention of mentions) {
      const key = this.computeKey(mention);

      if (this.seenIds.has(key)) {
        duplicates.push(mention);
        continue;
      }

      this.seenIds.add(key);
      unique.push(mention);
    }

    if (duplicates.length > 0) {
      logger.debug({ duplicates: duplicates.length }, "Duplicate mentions filtered");
    }

    return { unique, duplicates };
  }

  reset(): void {
    this.seenIds.clear();
  }

  private computeKey(mention: NormalizedMention): string {
    const hash = crypto.createHash("sha256");
    hash.update(mention.id);
    hash.update(mention.brand.toLowerCase());
    hash.update(mention.source);
    hash.update(mention.text.trim().toLowerCase());
    return hash.digest("hex");
  }
}
