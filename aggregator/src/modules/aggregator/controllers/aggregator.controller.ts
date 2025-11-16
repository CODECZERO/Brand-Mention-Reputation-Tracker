import type { Request, Response } from "express";
import { AggregatorService } from "../services/aggregator.service.js";

export class AggregatorController {
  constructor(private readonly aggregatorService: AggregatorService) {}

  getStatus = (_req: Request, res: Response): void => {
    const status = this.aggregatorService.getStatus();
    res.json(status);
  };

  triggerManualRun = async (_req: Request, res: Response): Promise<void> => {
    const started = await this.aggregatorService.triggerManualRun();

    if (!started) {
      res.status(409).json({ message: "Aggregator is already running" });
      return;
    }

    res.status(202).json({ message: "Aggregator cycle started" });
  };
}
