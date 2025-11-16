import { Router } from "express";
import { registry } from "../utils/metrics";

export const metricsRouter = Router();

metricsRouter.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", registry.contentType);
  const metrics = await registry.metrics();
  res.send(metrics);
});
