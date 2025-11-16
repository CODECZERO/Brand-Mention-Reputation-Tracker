import Parser from "rss-parser";
import { logger } from "../../../utils/logger.js";
import type { MentionProvider } from "../types/provider.js";
import type { RawMention } from "../types/mention.js";
import type { TrackedBrand } from "../../brands/types/brand.js";

interface RssItem {
  guid?: string;
  id?: string;
  isoDate?: string;
  pubDate?: string;
  title?: string;
  content?: string;
  contentSnippet?: string;
  link?: string;
  creator?: string;
  author?: string;
}

export class RssProvider implements MentionProvider {
  readonly platform = "rss" as const;
  private readonly parser = new Parser();

  isEnabled(brand: TrackedBrand): boolean {
    return Array.isArray(brand.rssFeeds) && brand.rssFeeds.length > 0;
  }

  async fetchMentions(brand: TrackedBrand): Promise<RawMention[]> {
    if (!this.isEnabled(brand)) {
      logger.debug({ brand: brand.name }, "RSS provider disabled for brand");
      return [];
    }

    const mentions: RawMention[] = [];

    for (const feedUrl of brand.rssFeeds ?? []) {
      try {
        const feed = await this.parser.parseURL(feedUrl);
        const items = feed.items ?? [];

        items.forEach((item, index) => {
          const rssItem = item as RssItem;
          const id = rssItem.guid ?? rssItem.id ?? `${feedUrl}-${index}`;
          const published = rssItem.isoDate ?? rssItem.pubDate ?? new Date().toISOString();
          const text = [rssItem.title, rssItem.contentSnippet ?? rssItem.content]
            .filter(Boolean)
            .join("\n\n");

          mentions.push({
            id,
            timestamp: published,
            text: text || "",
            author: rssItem.author ?? rssItem.creator ?? feed.title ?? "unknown",
            url: rssItem.link ?? feed.link ?? feedUrl,
            raw: rssItem,
            platform: this.platform,
          });
        });
      } catch (error) {
        logger.warn({ brand: brand.name, feedUrl, error }, "Failed to parse RSS feed");
      }
    }

    return mentions;
  }
}
