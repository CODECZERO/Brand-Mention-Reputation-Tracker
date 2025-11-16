import { randomUUID } from "node:crypto";
import type { RedisClientType } from "redis";
import { logger } from "../../../utils/logger.js";
import type { NormalizedMention } from "../types/mention.js";
import type { TrackedBrand } from "../../brands/types/brand.js";
import { wait } from "../../../utils/sleep.js";

const slugifyBrand = (brand: string): string =>
  brand
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");

export const toBrandSlug = (brand: string): string => slugifyBrand(brand);

const brandMentionsKey = (brand: string): string => `data:brand:${slugifyBrand(brand)}:mentions`;
const brandChunkQueueKey = (slug: string): string => `queue:brand:${slug}:chunks`;

const BRANDS_SET_KEY = "brands:set";
const brandMetadataKey = (brand: string): string => `brand:${slugifyBrand(brand)}:meta`;

interface RedisWriterOptions {
  maxRetries: number;
  backoffMs: number;
  ttlSeconds: number;
  chunkSize: number;
}

function safePayloadPreview(values: string[]): unknown {
  if (values.length === 0) {
    return null;
  }

  try {
    return JSON.parse(values[0]);
  } catch (error) {
    return { raw: values[0].slice(0, 256), error: (error as Error).message };
  }
}

export class RedisWriterService {
  constructor(
    private readonly client: RedisClientType,
    private readonly options: RedisWriterOptions,
  ) {}

  async writeMentions(mentions: NormalizedMention[]): Promise<number> {
    if (mentions.length === 0) {
      return 0;
    }

    const grouped = this.groupByBrand(mentions);
    let total = 0;

    for (const [key, payloads] of grouped.entries()) {
      total += payloads.length;
      console.log(
        "[aggregator] Preparing to write mentions",
        JSON.stringify({ key, count: payloads.length, preview: safePayloadPreview(payloads) }, null, 2),
      );
      await this.writeWithRetry(key, payloads);
    }

    return total;
  }

  async enqueueMentionChunks(brand: string, mentions: NormalizedMention[]): Promise<{ chunkCount: number; slug: string; queueKey: string; chunkSize: number }>
  {
    if (mentions.length === 0) {
      const slug = toBrandSlug(brand);
      return {
        chunkCount: 0,
        slug,
        queueKey: brandChunkQueueKey(slug),
        chunkSize: this.options.chunkSize,
      };
    }

    const slug = toBrandSlug(brand);
    const queueKey = brandChunkQueueKey(slug);
    const chunkSize = Math.max(1, this.options.chunkSize);
    const totalChunks = Math.ceil(mentions.length / chunkSize);
    const createdAt = new Date().toISOString();
    const payloads: string[] = [];

    for (let index = 0; index < totalChunks; index += 1) {
      const offset = index * chunkSize;
      const slice = mentions.slice(offset, offset + chunkSize);
      const chunkId = `${slug}-${Date.now()}-${index + 1}-${randomUUID()}`;
      const payload = JSON.stringify({
        brand: slug,
        chunkId,
        createdAt,
        meta: {
          chunkIndex: index + 1,
          totalChunks,
        },
        mentions: slice.map((mention) => ({
          id: mention.id,
          source: mention.source,
          text: mention.text,
          created_at: new Date(mention.timestamp).toISOString(),
          metadata: mention.metadata,
        })),
      });
      payloads.push(payload);
    }

    await this.enqueueChunksWithRetry(queueKey, payloads);

    console.log(
      "[aggregator] Enqueued chunk payloads",
      JSON.stringify(
        {
          brand,
          slug,
          queueKey,
          chunkCount: payloads.length,
          chunkSize,
          preview: safePayloadPreview(payloads),
        },
        null,
        2,
      ),
    );

    logger.info({ brand, slug, queueKey, chunkCount: payloads.length, mentions: mentions.length }, "Enqueued mention chunks for worker queue");

    return {
      chunkCount: payloads.length,
      slug,
      queueKey,
      chunkSize,
    };
  }

  private groupByBrand(mentions: NormalizedMention[]): Map<string, string[]> {
    const result = new Map<string, string[]>();

    for (const mention of mentions) {
      const key = brandMentionsKey(mention.brand);
      const serialized = JSON.stringify(mention);

      if (!result.has(key)) {
        result.set(key, []);
      }

      result.get(key)!.push(serialized);
    }

    return result;
  }

  private async writeWithRetry(key: string, values: string[]): Promise<void> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.options.maxRetries) {
      try {
        await this.client.rPush(key, values);
        await this.client.expire(key, this.options.ttlSeconds);
        console.log(
          "[aggregator] Wrote mentions to Redis",
          JSON.stringify({ key, count: values.length, preview: safePayloadPreview(values) }, null, 2),
        );
        return;
      } catch (error) {
        lastError = error;
        attempt += 1;
        logger.error({ key, attempt, error }, "Failed to write mentions to Redis");

        if (attempt > this.options.maxRetries) {
          break;
        }

        const delay = this.options.backoffMs * 2 ** (attempt - 1);
        await wait(delay);
      }
    }

    throw lastError;
  }

  async registerBrand(brand: TrackedBrand): Promise<string> {
    const slug = toBrandSlug(brand.name);
    const metadata = {
      name: brand.name,
      slug,
      aliases: Array.isArray(brand.aliases) ? brand.aliases : [],
      rssFeeds: Array.isArray(brand.rssFeeds) ? brand.rssFeeds : [],
      keywords: Array.isArray(brand.keywords) ? brand.keywords : [],
      updatedAt: new Date().toISOString(),
    };

    const pipeline = this.client.multi();
    pipeline.sAdd(BRANDS_SET_KEY, slug);
    pipeline.set(brandMetadataKey(brand.name), JSON.stringify(metadata), {
      EX: this.options.ttlSeconds,
    });
    await pipeline.exec();

    console.log(
      "[aggregator] Registered brand metadata",
      JSON.stringify({ slug, metadata }, null, 2),
    );

    return slug;
  }

  async purgeBrandData(brand: string): Promise<void> {
    const slug = toBrandSlug(brand);
    const mentionsKey = brandMentionsKey(slug);
    const metadataKey = brandMetadataKey(slug);

    const pipeline = this.client.multi();
    pipeline.del(mentionsKey);
    pipeline.del(metadataKey);
    pipeline.sRem(BRANDS_SET_KEY, slug);

    const results = await pipeline.exec();

    const firstResult = results?.[0];
    const deletedMentions =
      typeof firstResult === "number"
        ? firstResult
        : Array.isArray(firstResult) && typeof firstResult[1] === "number"
          ? firstResult[1]
          : 0;

    if (deletedMentions > 0) {
      logger.info({ brand: slug, mentionsKey }, "Purged brand mentions from Redis");
    }
  }

  private async enqueueChunksWithRetry(key: string, values: string[]): Promise<void> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.options.maxRetries) {
      try {
        const pipeline = this.client.multi();
        pipeline.rPush(key, values);
        pipeline.expire(key, this.options.ttlSeconds);
        await pipeline.exec();
        console.log(
          "[aggregator] Queued chunks to Redis",
          JSON.stringify({ key, count: values.length, preview: safePayloadPreview(values) }, null, 2),
        );
        return;
      } catch (error) {
        lastError = error;
        attempt += 1;
        logger.error({ key, attempt, error }, "Failed to enqueue mention chunks to Redis queue");

        if (attempt > this.options.maxRetries) {
          break;
        }

        const delay = this.options.backoffMs * 2 ** (attempt - 1);
        await wait(delay);
      }
    }

    throw lastError;
  }
}
