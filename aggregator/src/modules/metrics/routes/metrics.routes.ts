import { Router } from "express";
import { MetricsController } from "../controllers/metrics.controller.js";
import { MetricsService } from "../metrics.service.js";

export const createMetricsRouter = (
  controller: MetricsController,
  metrics: MetricsService,
): Router => {
  const router = Router();

  router.get("/", (req, res, next) => {
    if (!metrics.isEnabled()) {
      res.status(503).json({ message: "Metrics collection disabled" });
      return;
    }

    controller.getMetrics(req, res).catch(next);
  });

  return router;
};
