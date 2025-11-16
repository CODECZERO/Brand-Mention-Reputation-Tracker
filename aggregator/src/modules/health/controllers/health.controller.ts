import type { Request, Response } from "express";
import { env } from "../../../config/env.js";

export class HealthController {
  getStatus = (_req: Request, res: Response): void => {
    res.json({ status: "ok", service: "aggregator", timestamp: new Date().toISOString(), env: env.nodeEnv });
  };
}
