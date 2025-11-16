import { logger } from "../../../utils/logger.js";
import type { NormalizedMention } from "../types/mention.js";

export interface ValidationResult {
  mention: NormalizedMention;
  errors: string[];
}

export class MentionValidatorService {
  validate(mention: NormalizedMention): ValidationResult {
    const errors: string[] = [];

    if (!mention.id?.trim()) {
      errors.push("id is required");
    }

    if (!mention.brand?.trim()) {
      errors.push("brand is required");
    }

    if (!mention.text?.trim()) {
      errors.push("text is required");
    }

    if (!Number.isFinite(mention.timestamp) || mention.timestamp <= 0) {
      errors.push("timestamp must be a positive number");
    }

    if (!mention.source) {
      errors.push("source is required");
    }

    if (!mention.metadata) {
      errors.push("metadata is required");
    } else {
      if (!mention.metadata.author) {
        errors.push("metadata.author is required");
      }

      if (!mention.metadata.url) {
        errors.push("metadata.url is required");
      }
    }

    return { mention, errors };
  }

  filterValid(mentions: NormalizedMention[]): { valid: NormalizedMention[]; invalid: ValidationResult[] } {
    const valid: NormalizedMention[] = [];
    const invalid: ValidationResult[] = [];

    for (const mention of mentions) {
      const result = this.validate(mention);
      if (result.errors.length > 0) {
        logger.warn({ mentionId: mention.id, brand: mention.brand, errors: result.errors }, "Mention validation failed");
        invalid.push(result);
      } else {
        valid.push(mention);
      }
    }

    return { valid, invalid };
  }
}
