import { createApp, startHttpServer } from "./app.js";
import { env } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./config/mongo.js";
import { getRedisClient, disconnectRedis } from "./config/redis.js";
import { HttpClient } from "./utils/http-client.js";
import { logger } from "./utils/logger.js";
import { MentionNormalizerService } from "./modules/aggregator/services/normalizer.service.js";
import { MentionValidatorService } from "./modules/aggregator/services/validator.service.js";
import { RedisWriterService } from "./modules/aggregator/services/redis-writer.service.js";
import { AggregatorService } from "./modules/aggregator/services/aggregator.service.js";
import { AggregatorController } from "./modules/aggregator/controllers/aggregator.controller.js";
import { createAggregatorRouter } from "./modules/aggregator/routes/aggregator.routes.js";
import { BrandRepository } from "./modules/brands/repositories/brand.repository.js";
import { BrandService } from "./modules/brands/services/brand.service.js";
import { BrandsController } from "./modules/brands/controllers/brands.controller.js";
import { createBrandsRouter } from "./modules/brands/routes/brands.routes.js";
import { HealthController } from "./modules/health/controllers/health.controller.js";
import { createHealthRouter } from "./modules/health/routes/health.routes.js";
import { MetricsService } from "./modules/metrics/metrics.service.js";
import { MetricsController } from "./modules/metrics/controllers/metrics.controller.js";
import { createMetricsRouter } from "./modules/metrics/routes/metrics.routes.js";
import { SchedulerService } from "./modules/scheduler/scheduler.service.js";
import { RedditProvider } from "./modules/aggregator/providers/reddit.provider.js";
import { NewsProvider } from "./modules/aggregator/providers/news.provider.js";
import { XProvider } from "./modules/aggregator/providers/x.provider.js";
import { RssProvider } from "./modules/aggregator/providers/rss.provider.js";
import type { MentionProvider } from "./modules/aggregator/types/provider.js";
import { SlidingWindowRateLimiter } from "./utils/rate-limiter.js";

async function bootstrap(): Promise<void> {
  try {
    const rateLimiter = new SlidingWindowRateLimiter(
      env.aggregator.rateLimit.maxRequests,
      env.aggregator.rateLimit.intervalMs,
    );

    const httpClient = new HttpClient({
      timeoutMs: env.aggregator.requestTimeoutMs,
      maxRetries: env.aggregator.requestMaxRetries,
      backoffMs: env.aggregator.requestRetryBackoffMs,
      limiter: rateLimiter,
    });

    await connectMongo();
    console.log("[Bootstrap] MongoDB connection established");
    const redisClient = await getRedisClient();
    console.log("[Bootstrap] Redis connection established");

    const redisWriter = new RedisWriterService(redisClient, {
      maxRetries: env.aggregator.requestMaxRetries,
      backoffMs: env.aggregator.requestRetryBackoffMs,
      ttlSeconds: env.aggregator.redisTtlSeconds,
      chunkSize: env.aggregator.chunkSize,
    });

    const brandRepository = new BrandRepository();
    const brandService = new BrandService(brandRepository);

    const metricsService = new MetricsService();
    const normalizerService = new MentionNormalizerService();
    const validatorService = new MentionValidatorService();

    const providers: MentionProvider[] = [
      new RedditProvider(httpClient),
      new NewsProvider(httpClient),
      new XProvider(),
      new RssProvider(),
    ];

    const aggregatorService = new AggregatorService(
      brandService,
      providers,
      normalizerService,
      validatorService,
      redisWriter,
      metricsService,
    );

    const aggregatorController = new AggregatorController(aggregatorService);
    const brandsController = new BrandsController(brandService);
    const metricsController = new MetricsController(metricsService);
    const healthController = new HealthController();

    const scheduler = new SchedulerService(aggregatorService, {
      intervalMs: env.aggregator.intervalMs,
      immediate: true,
    });

    const app = createApp({
      health: createHealthRouter(healthController),
      metrics: createMetricsRouter(metricsController, metricsService),
      aggregator: createAggregatorRouter(aggregatorController),
      brands: createBrandsRouter(brandsController),
    });

    startHttpServer(app);
    scheduler.start();

    const shutdown = async (signal: string): Promise<void> => {
      logger.info({ signal }, "Shutting down aggregator service");
      scheduler.stop();
      await disconnectRedis();
      await disconnectMongo();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  } catch (error) {
    logger.error({ error }, "Aggregator bootstrap failed");
    console.error("[Aggregator] Bootstrap failed", error);
    process.exit(1);
  }
}

export async function start(): Promise<void> {
  await bootstrap();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void start();
}
