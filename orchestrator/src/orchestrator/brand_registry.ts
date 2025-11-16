import type { Redis } from "ioredis";

import { logger } from "./logger.js";
import { buildBrandListKey } from "./utils.js";

function isWrongTypeError(error: unknown): boolean {
  return typeof (error as { message?: unknown })?.message === "string" && (error as { message?: string }).message!.includes("WRONGTYPE");
}

function normaliseBrands(brands: string[]): string[] {
  return Array.from(
    new Set(
      brands
        .map((brand) => brand.trim())
        .filter((brand) => brand.length > 0)
    )
  );
}

export async function loadRegisteredBrands(redis: Redis): Promise<string[]> {
  const key = buildBrandListKey();

  let brands: string[] = [];

  try {
    brands = await redis.smembers(key);
  } catch (error) {
    if (!isWrongTypeError(error)) {
      throw error;
    }
  }

  if (brands.length === 0) {
    try {
      brands = await redis.lrange(key, 0, -1);
    } catch (error) {
      if (!isWrongTypeError(error)) {
        throw error;
      }
    }
  }

  if (brands.length === 0) {
    logger.warn({ brandListKey: key }, "No registered brands found in Redis");
  }

  return normaliseBrands(brands);
}
