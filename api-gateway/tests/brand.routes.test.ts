import request from "supertest";
import { createApp } from "../src/app";
import * as brandService from "../src/modules/brand/brand.service";
import { ValidationError, RedisUnavailableError } from "../src/utils/errors";

jest.mock("../src/config/mongo", () => ({
  connectMongo: jest.fn(),
  closeMongo: jest.fn(),
}));

jest.mock("../src/utils/redis", () => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  getJSON: jest.fn(),
  getList: jest.fn(),
  scanKeys: jest.fn(),
}));

describe("API Gateway routes", () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("health and metrics", () => {
    it("returns ok status on /health", async () => {
      const response = await request(app).get("/health");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "ok", service: "api" });
    });

    it("exposes prometheus metrics", async () => {
      const response = await request(app).get("/metrics");
      expect(response.status).toBe(200);
      expect(response.text).toContain("# HELP api_requests_total");
    });
  });

  describe("brand management", () => {
    it("returns waiting status when no brand is set", async () => {
      jest.spyOn(brandService, "getCurrentBrand").mockResolvedValue(null);

      const response = await request(app).get("/api/brands/current");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "waiting", message: "No brand set" });
    });

    it("returns current brand when available", async () => {
      jest.spyOn(brandService, "getCurrentBrand").mockResolvedValue({
        name: "Nike",
        slug: "nike",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app).get("/api/brands/current");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ name: "Nike", slug: "nike" });
    });

    it("sets brand and returns 201", async () => {
      jest.spyOn(brandService, "setCurrentBrand").mockResolvedValue({
        name: "Nike",
        slug: "nike",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app).post("/api/brands/set").send({ brand: "Nike" });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ name: "Nike", slug: "nike" });
    });

    it("returns validation error when brand is missing", async () => {
      jest.spyOn(brandService, "setCurrentBrand").mockRejectedValue(new ValidationError("brand is required", 400));

      const response = await request(app).post("/api/brands/set").send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ status: "error", message: "brand is required" });
    });
  });

  describe("brand data routes", () => {
    it("returns waiting status when live mentions are empty", async () => {
      jest.spyOn(brandService, "fetchLiveMentions").mockResolvedValue({
        mentions: [],
        brand: "nike",
        redisLatencySeconds: 0.02,
      });

      const response = await request(app).get("/api/brands/nike/live");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "waiting", message: "No data available yet" });
    });

    it("returns live mentions when available", async () => {
      const mentions = [
        {
          id: "1",
          timestamp: Date.now(),
          text: "Sample mention",
          author: "user",
          platform: "twitter",
          url: "http://example.com",
          brand: "nike",
        },
      ];

      jest.spyOn(brandService, "fetchLiveMentions").mockResolvedValue({
        mentions,
        brand: "nike",
        redisLatencySeconds: 0.01,
      });

      const response = await request(app).get("/api/brands/nike/live");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mentions);
    });

    it("returns waiting status when chunk results are empty", async () => {
      jest.spyOn(brandService, "fetchChunkResults").mockResolvedValue({
        chunks: [],
        brand: "nike",
        redisLatencySeconds: 0.03,
      });

      const response = await request(app).get("/api/brands/nike/chunks");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "waiting", message: "No chunk results yet" });
    });

    it("returns chunk results when available", async () => {
      const chunks = [
        {
          chunkId: "chunk-1",
          sentiment: { pos: 5, neg: 1, neu: 2 },
          topics: ["performance"],
          spike: false,
          total: 8,
        },
      ];

      jest.spyOn(brandService, "fetchChunkResults").mockResolvedValue({
        chunks,
        brand: "nike",
        redisLatencySeconds: 0.05,
      });

      const response = await request(app).get("/api/brands/nike/chunks");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(chunks);
    });

    it("returns waiting status when summary is missing", async () => {
      jest.spyOn(brandService, "fetchSummary").mockResolvedValue({
        summary: null,
        brand: "nike",
        redisLatencySeconds: 0.02,
      });

      const response = await request(app).get("/api/brands/nike/summary");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "waiting", message: "No summary yet" });
    });

    it("returns summary when available", async () => {
      const summary = {
        brand: "nike",
        totalMentions: 100,
        overallSentiment: { pos: 60, neg: 20, neu: 20 },
        topTopics: ["innovation"],
        spikeDetected: false,
        summaryText: "Strong performance",
      };

      jest.spyOn(brandService, "fetchSummary").mockResolvedValue({
        summary,
        brand: "nike",
        redisLatencySeconds: 0.02,
      });

      const response = await request(app).get("/api/brands/nike/summary");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(summary);
    });

    it("returns redis unavailable when redis errors", async () => {
      jest
        .spyOn(brandService, "fetchSummary")
        .mockRejectedValue(new RedisUnavailableError("Redis unavailable"));

      const response = await request(app).get("/api/brands/nike/summary");

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: "error", message: "Redis unavailable" });
    });

    it("returns internal error when handler throws", async () => {
      jest.spyOn(brandService, "fetchLiveMentions").mockRejectedValue(new Error("boom"));

      const response = await request(app).get("/api/brands/nike/live");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ status: "error", message: "Internal server error" });
    });

    it("returns waiting status when spikes are empty", async () => {
      jest.spyOn(brandService, "fetchSpikes").mockResolvedValue({
        timeline: [],
        last24hCount: 0,
        brand: "nike",
        redisLatencySeconds: 0.02,
      });

      const response = await request(app).get("/api/brands/nike/spikes");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "waiting", message: "No spikes detected" });
    });

    it("returns spikes when available", async () => {
      const timeline = [
        {
          timestamp: new Date().toISOString(),
          spikeScore: 12,
          mentionCount: 40,
          threshold: 10,
        },
      ];

      jest.spyOn(brandService, "fetchSpikes").mockResolvedValue({
        timeline,
        last24hCount: timeline.length,
        brand: "nike",
        redisLatencySeconds: 0.04,
      });

      const response = await request(app).get("/api/brands/nike/spikes");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ timeline, last24hCount: 1 });
    });
  });
});
