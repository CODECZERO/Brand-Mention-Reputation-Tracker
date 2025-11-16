import { Router } from "express";
import {
  getCurrentBrandHandler,
  setBrandHandler,
  getLiveMentionsHandler,
  getChunkResultsHandler,
  getSummaryHandler,
  getAnalyticsHandler,
  getSpikesHandler,
} from "../modules/brand/brand.controller";

export const brandRouter = Router();

brandRouter.get("/current", getCurrentBrandHandler);
brandRouter.post("/set", setBrandHandler);
brandRouter.get("/:brand/live", getLiveMentionsHandler);
brandRouter.get("/:brand/chunks", getChunkResultsHandler);
brandRouter.get("/:brand/summary", getSummaryHandler);
brandRouter.get("/:brand/spikes", getSpikesHandler);
brandRouter.get("/:brand/analytics", getAnalyticsHandler);
