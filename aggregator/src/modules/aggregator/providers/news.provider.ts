import { HttpClient } from "../../../utils/http-client.js";
import { env } from "../../../config/env.js";
import type { MentionProvider } from "../types/provider.js";
import type { RawMention } from "../types/mention.js";
import type { TrackedBrand } from "../../brands/types/brand.js";

interface NewsApiArticle {
  source?: { id?: string | null; name?: string | null };
  author?: string | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  urlToImage?: string | null;
  publishedAt?: string | null;
  content?: string | null;
}

interface NewsApiResponse {
  status?: string;
  totalResults?: number;
  articles?: NewsApiArticle[];
}

export class NewsProvider implements MentionProvider {
  readonly platform = "news" as const;

  constructor(private readonly client: HttpClient) {}

  isEnabled(_brand: TrackedBrand): boolean {
    return Boolean(env.newsApi.apiKey && env.newsApi.apiUrl);
  }

  async fetchMentions(brand: TrackedBrand): Promise<RawMention[]> {
    if (!this.isEnabled(brand)) {
      return [];
    }

    const terms = [brand.name, ...(brand.aliases ?? [])]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" OR ");

    const response = await this.client.get<NewsApiResponse>(env.newsApi.apiUrl, {
      params: {
        q: terms.length > 0 ? terms : brand.name,
        pageSize: 25,
        sortBy: "publishedAt",
        language: "en",
      },
      headers: {
        "X-Api-Key": env.newsApi.apiKey,
      },
    });

    const articles = response.data.articles ?? [];

    return articles
      .filter((article): article is Required<Pick<NewsApiArticle, "title" | "url" | "publishedAt">> & NewsApiArticle => {
        return Boolean(article?.title && article?.url && article?.publishedAt);
      })
      .map<RawMention>((article, index) => ({
        id: `${brand.name.toLowerCase()}-news-${article.url ?? index}`,
        timestamp: article.publishedAt ?? new Date().toISOString(),
        text: [article.title, article.description, article.content].filter(Boolean).join("\n\n"),
        author: article.author ?? article.source?.name ?? "unknown",
        url: article.url ?? "",
        raw: article,
        platform: this.platform,
      }));
  }
}
