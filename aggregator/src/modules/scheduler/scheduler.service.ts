import { logger } from "../../utils/logger.js";
import type { AggregatorService, AggregatorTrigger } from "../aggregator/services/aggregator.service.js";

export interface SchedulerOptions {
  intervalMs: number;
  immediate?: boolean;
}

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly immediate: boolean;

  constructor(
    private readonly aggregatorService: AggregatorService,
    options: SchedulerOptions,
  ) {
    this.intervalMs = Math.max(1_000, options.intervalMs);
    this.immediate = options.immediate ?? true;
  }

  start(): void {
    if (this.timer) {
      logger.warn("Scheduler already running");
      return;
    }

    logger.info({ intervalMs: this.intervalMs }, "Starting aggregator scheduler");

    if (this.immediate) {
      void this.runCycle("scheduler");
    }

    this.timer = setInterval(() => {
      void this.runCycle("scheduler");
    }, this.intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
    logger.info("Aggregator scheduler stopped");
  }

  private async runCycle(trigger: AggregatorTrigger): Promise<void> {
    try {
      logger.info({ trigger }, "Scheduler invoking aggregator cycle");
      await this.aggregatorService.runCycle(trigger);
    } catch (error) {
      logger.error({ trigger, error }, "Scheduler failed to execute aggregator cycle");
    }
  }
}
