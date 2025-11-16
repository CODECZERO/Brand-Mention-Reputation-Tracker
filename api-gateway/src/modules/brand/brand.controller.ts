import type { Request, Response, NextFunction } from "express";
import {
  fetchChunkResults,
  fetchLiveMentions,
  fetchAnalytics,
  fetchSummary,
  fetchSpikes,
  getCurrentBrand,
  setCurrentBrand,
} from "./brand.service";
import { waiting, error as errorResponse } from "../../utils/responses";
import { ValidationError, RedisUnavailableError } from "../../utils/errors";
import { apiRequestsTotal, apiResponseTimeSeconds } from "../../utils/metrics";
import { logger } from "../../utils/logger";

interface TrackedResponse {
  data: unknown;
  brand?: string;
  redisLatencySeconds?: number;
  count?: number;
  waiting?: boolean;
}

async function withMetrics(
  req: Request,
  res: Response,
  route: string,
  handler: () => Promise<TrackedResponse | null>,
): Promise<void> {
  const endTimer = apiResponseTimeSeconds.startTimer({ route, method: req.method });
  const startHighRes = process.hrtime.bigint();
  apiRequestsTotal.inc({ route, method: req.method, status: "started" });

  let result: TrackedResponse | null = null;
  let statusCode = 200;

  try {
    result = await handler();
    statusCode = res.statusCode || 200;
  } catch (error) {
    statusCode = res.statusCode >= 400 ? res.statusCode : 500;
    apiRequestsTotal.inc({ route, method: req.method, status: String(statusCode) });
    const totalTimeSeconds = Number(process.hrtime.bigint() - startHighRes) / 1_000_000_000;
    logger.error({
      route,
      method: req.method,
      statusCode,
      totalRequestTime: totalTimeSeconds,
      error,
    });
    throw error;
  } finally {
    endTimer();
  }

  apiRequestsTotal.inc({ route, method: req.method, status: String(statusCode) });
  const totalTimeSeconds = Number(process.hrtime.bigint() - startHighRes) / 1_000_000_000;

  if (result) {
    const count = result.waiting ? 0 : result.count ?? inferCount(result.data);
    logger.info({
      route,
      method: req.method,
      statusCode,
      brand: result.brand,
      redisLatency: result.redisLatencySeconds,
      totalRequestTime: totalTimeSeconds,
      count,
    });
    return;
  }

  logger.info({
    route,
    method: req.method,
    statusCode,
    totalRequestTime: totalTimeSeconds,
  });
}

function inferCount(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object" && "count" in value && typeof (value as { count?: number }).count === "number") {
    return (value as { count: number }).count;
  }
  return undefined;
}

export async function getCurrentBrandHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await withMetrics(req, res, "brand_current", async () => {
      const brand = await getCurrentBrand();
      if (!brand) {
        res.json(waiting("No brand set"));
        return null;
      }
      res.json({ name: brand.name, slug: brand.slug });
      return { data: { name: brand.name, slug: brand.slug }, brand: brand.slug };
    });
  } catch (error) {
    next(error);
  }
}

export async function getSpikesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await withMetrics(req, res, "brand_spikes", async () => {
      const { brand } = req.params;
      const result = await fetchSpikes(brand);
      if (result.timeline.length === 0) {
        res.json(waiting("No spikes detected"));
        return {
          data: waiting("No spikes detected"),
          brand: result.brand,
          redisLatencySeconds: result.redisLatencySeconds,
          waiting: true,
        };
      }
      res.json({ timeline: result.timeline, last24hCount: result.last24hCount });
      return {
        data: { timeline: result.timeline, last24hCount: result.last24hCount },
        brand: result.brand,
        redisLatencySeconds: result.redisLatencySeconds,
        count: result.timeline.length,
      };
    });
  } catch (error) {
    handleError(res, error, next);
  }
}

export async function getAnalyticsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await withMetrics(req, res, "brand_analytics", async () => {
      const { brand } = req.params;
      const result = await fetchAnalytics(brand);
      if (!result.analytics) {
        res.json(waiting("No analytics yet"));
        return {
          data: waiting("No analytics yet"),
          brand: result.brand,
          redisLatencySeconds: result.redisLatencySeconds,
          waiting: true,
        };
      }
      res.json(result.analytics);
      return {
        data: result.analytics,
        brand: result.brand,
        redisLatencySeconds: result.redisLatencySeconds,
      };
    });
  } catch (error) {
    handleError(res, error, next);
  }
}

export async function setBrandHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await withMetrics(req, res, "brand_set", async () => {
      const { brand } = req.body ?? {};
      const created = await setCurrentBrand(brand);
      const response = { name: created.name, slug: created.slug };
      res.status(201).json(response);
      return { data: response, brand: created.slug };
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(error.statusCode).json(errorResponse(error.message));
      return;
    }
    next(error);
  }
}

export async function getLiveMentionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await withMetrics(req, res, "brand_live", async () => {
      const { brand } = req.params;
      const result = await fetchLiveMentions(brand);
      if (result.mentions.length === 0) {
        res.json(waiting("No data available yet"));
        return {
          data: waiting("No data available yet"),
          brand: result.brand,
          redisLatencySeconds: result.redisLatencySeconds,
          waiting: true,
        };
      }
      res.json(result.mentions);
      return {
        data: result.mentions,
        brand: result.brand,
        redisLatencySeconds: result.redisLatencySeconds,
        count: result.mentions.length,
      };
    });
  } catch (error) {
    handleError(res, error, next);
  }
}

export async function getChunkResultsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await withMetrics(req, res, "brand_chunks", async () => {
      const { brand } = req.params;
      const result = await fetchChunkResults(brand);
      if (result.chunks.length === 0) {
        res.json(waiting("No chunk results yet"));
        return {
          data: waiting("No chunk results yet"),
          brand: result.brand,
          redisLatencySeconds: result.redisLatencySeconds,
          waiting: true,
        };
      }
      res.json(result.chunks);
      return {
        data: result.chunks,
        brand: result.brand,
        redisLatencySeconds: result.redisLatencySeconds,
        count: result.chunks.length,
      };
    });
  } catch (error) {
    handleError(res, error, next);
  }
}

export async function getSummaryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await withMetrics(req, res, "brand_summary", async () => {
      const { brand } = req.params;
      const result = await fetchSummary(brand);
      if (!result.summary) {
        res.json(waiting("No summary yet"));
        return {
          data: waiting("No summary yet"),
          brand: result.brand,
          redisLatencySeconds: result.redisLatencySeconds,
          waiting: true,
        };
      }
      res.json(result.summary);
      return {
        data: result.summary,
        brand: result.brand,
        redisLatencySeconds: result.redisLatencySeconds,
      };
    });
  } catch (error) {
    handleError(res, error, next);
  }
}

function handleError(res: Response, error: unknown, next: NextFunction): void {
  if (error instanceof ValidationError) {
    res.status(error.statusCode).json(errorResponse(error.message));
    return;
  }

  if (error instanceof RedisUnavailableError) {
    res.status(503).json(errorResponse(error.message));
    return;
  }

  next(error);
}
