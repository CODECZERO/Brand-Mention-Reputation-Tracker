import type { TrackedBrand } from "../../brands/types/brand.js";
import type { RawMention } from "./mention.js";

export interface MentionProvider {
  readonly platform: RawMention["platform"];
  isEnabled(brand: TrackedBrand): boolean;
  fetchMentions(brand: TrackedBrand): Promise<RawMention[]>;
}
