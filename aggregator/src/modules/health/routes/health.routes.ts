import { Router } from "express";
import { HealthController } from "../controllers/health.controller.js";

export const createHealthRouter = (controller: HealthController): Router => {
  const router = Router();

  router.get("/", controller.getStatus);

  return router;
};
