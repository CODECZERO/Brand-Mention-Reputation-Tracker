import type { Db, Document } from "mongodb";
import { connectMongo } from "../../../config/mongo.js";
import { logger } from "../../../utils/logger.js";
import type { TrackedBrand } from "../types/brand.js";

interface BrandDocument extends Document {
  name?: string;
  aliases?: string[];
  rssFeeds?: string[];
  keywords?: string[];
  updatedAt?: Date;
  createdAt?: Date;
  isActive?: boolean;
}

export class BrandRepository {
  private readonly collectionName = "brands";

  async findAll(): Promise<TrackedBrand[]> {
    const db: Db = await connectMongo();
    const collection = db.collection<BrandDocument>(this.collectionName);

    let cursor;
    try {
      cursor = collection
        .find({})
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(100);
    } catch (error) {
      logger.error({
        database: db.databaseName,
        collection: this.collectionName,
        error,
      }, "Failed to create MongoDB cursor for brands");
      throw error;
    }

    const seen = new Set<string>();
    const brands: TrackedBrand[] = [];

    try {
      for await (const doc of cursor) {
        const name = doc.name?.trim();
        if (!name || seen.has(name.toLowerCase())) {
          continue;
        }

        seen.add(name.toLowerCase());
        brands.push({
          name,
          aliases: Array.isArray(doc.aliases) ? doc.aliases.filter(Boolean) : [],
          rssFeeds: Array.isArray(doc.rssFeeds) ? doc.rssFeeds.filter(Boolean) : [],
          keywords: Array.isArray(doc.keywords) ? doc.keywords.filter(Boolean) : [],
        });
      }
    } catch (error) {
      logger.error({
        database: db.databaseName,
        collection: this.collectionName,
        error,
      }, "Failed while iterating MongoDB cursor for brands");
      throw error;
    }

    if (brands.length === 0) {
      try {
        const totalDocs = await collection.estimatedDocumentCount();
        logger.warn({
          database: db.databaseName,
          collection: this.collectionName,
          totalDocs,
        }, "No tracked brands found in MongoDB");
      } catch (countError) {
        logger.warn({
          database: db.databaseName,
          collection: this.collectionName,
          error: countError,
        }, "No tracked brands found and failed to count MongoDB documents");
      }
    } else {
      logger.debug({
        database: db.databaseName,
        collection: this.collectionName,
        count: brands.length,
        brands: brands.map((brand) => brand.name),
      }, "Fetched tracked brands from MongoDB");
    }

    return brands;
  }
}
