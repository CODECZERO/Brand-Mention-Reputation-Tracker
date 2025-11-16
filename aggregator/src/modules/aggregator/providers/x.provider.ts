import { env } from "../../../config/env.js";
import { wait } from "../../../utils/sleep.js";
import { logger } from "../../../utils/logger.js";
import type { MentionProvider } from "../types/provider.js";
import type { RawMention } from "../types/mention.js";
import type { TrackedBrand } from "../../brands/types/brand.js";

interface XSampleTweet {
  id: string;
  created_at: string;
  text: string;
  author: string;
  url: string;
}

export class XProvider implements MentionProvider {
  readonly platform = "x" as const;

  isEnabled(_brand: TrackedBrand): boolean {
    return Boolean(env.x.apiKey);
  }

  async fetchMentions(brand: TrackedBrand): Promise<RawMention[]> {
    if (!this.isEnabled(brand)) {
      logger.warn({ brand: brand.name }, "X provider disabled due to missing API key");
      return [];
    }

    try {
      const simulated: XSampleTweet[] = await this.simulateTweets(brand);

      return simulated.map<RawMention>((tweet) => ({
        id: tweet.id,
        timestamp: tweet.created_at,
        text: tweet.text,
        author: tweet.author,
        url: tweet.url,
        raw: tweet,
        platform: this.platform,
      }));
    } catch (error) {
      logger.warn({ brand: brand.name, error }, "Failed to simulate X mentions");
      return [];
    }
  }

  private async simulateTweets(brand: TrackedBrand): Promise<XSampleTweet[]> {
    const aliases = [brand.name, ...(brand.aliases ?? [])];
    const keyword = aliases[Math.floor(Math.random() * aliases.length)] ?? brand.name;

    await wait(100);

    const now = Date.now();
    return Array.from({ length: 3 }).map((_, index) => ({
      id: `x-${brand.name.toLowerCase()}-${now}-${index}`,
      created_at: new Date(now - index * 60_000).toISOString(),
      text: `Simulated post mentioning ${keyword} on X at ${new Date(now).toISOString()}`,
      author: `@${brand.name.toLowerCase()}_watcher${index}`,
      url: `https://x.com/${brand.name.toLowerCase()}/status/${now + index}`,
    }));
  }
}
