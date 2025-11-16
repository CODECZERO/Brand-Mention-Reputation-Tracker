import type { Request, Response } from "express";
import { MetricsService } from "../metrics.service.js";

export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  getMetrics = async (_req: Request, res: Response): Promise<void> => {
    const payload = await this.metricsService.getMetrics();
    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    res.send(payload);
  };
}
