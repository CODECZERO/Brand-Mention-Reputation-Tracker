import { Router } from "express";
import { AggregatorController } from "../controllers/aggregator.controller.js";

export const createAggregatorRouter = (
  controller: AggregatorController,
): Router => {
  const router = Router();

  router.get("/status", controller.getStatus);
  router.post("/trigger", controller.triggerManualRun);

  return router;
};
