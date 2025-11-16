import { HttpClient } from "../../../utils/http-client.js";
import { env } from "../../../config/env.js";
import type { TrackedBrand } from "../../brands/types/brand.js";
import type { MentionProvider } from "../types/provider.js";
import type { RawMention } from "../types/mention.js";

interface RedditSearchResponse {
  data?: {
    children?: Array<{
      data?: {
        id?: string;
        created_utc?: number;
        title?: string;
        selftext?: string;
        author?: string;
        permalink?: string;
        url?: string;
      };
    }>;
  };
}

export class RedditProvider implements MentionProvider {
  readonly platform = "reddit" as const;

  private readonly client: HttpClient;

  constructor(client: HttpClient) {
    this.client = client;
  }

  isEnabled(_brand: TrackedBrand): boolean {
    return Boolean(env.reddit.apiUrl);
  }

  async fetchMentions(brand: TrackedBrand): Promise<RawMention[]> {
    const terms = [brand.name, ...(brand.aliases ?? [])]
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => `"${value}"`)
      .join(" OR ");

    const response = await this.client.get<RedditSearchResponse>(env.reddit.apiUrl, {
      params: {
        q: terms.length > 0 ? terms : brand.name,
        sort: "new",
        limit: 25,
        restrict_sr: false,
        t: "hour",
      },
      headers: {
        "User-Agent": "rapidquest-aggregator/1.0",
      },
    });

    const posts = response.data.data?.children ?? [];

    return posts
      .map((child) => child.data)
      .filter((post): post is NonNullable<typeof post> => Boolean(post?.id && post?.created_utc))
      .map<RawMention>((post) => ({
        id: post.id!,
        timestamp: (post.created_utc ?? 0) * 1000,
        text: [post.title, post.selftext].filter(Boolean).join("\n"),
        author: post.author ?? "unknown",
        url: post.permalink ? `https://reddit.com${post.permalink}` : post.url ?? "",
        raw: post,
        platform: "reddit",
      }));
  }
}
