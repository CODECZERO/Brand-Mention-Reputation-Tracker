import { wait } from "./sleep.js";

export interface RateLimiter {
  acquire(): Promise<void>;
}

export class SlidingWindowRateLimiter implements RateLimiter {
  private readonly timestamps: number[] = [];
  private pending: Promise<void> | null = null;

  constructor(
    private readonly maxRequests: number,
    private readonly intervalMs: number,
  ) {
    if (maxRequests <= 0) {
      throw new Error("maxRequests must be greater than zero");
    }

    if (intervalMs <= 0) {
      throw new Error("intervalMs must be greater than zero");
    }
  }

  async acquire(): Promise<void> {
    if (this.pending) {
      await this.pending;
    }

    const now = Date.now();
    this.prune(now);

    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(now);
      return;
    }

    const waitFor = this.intervalMs - (now - this.timestamps[0]);
    const delay = Math.max(waitFor, 0);

    this.pending = (async () => {
      await wait(delay);
      this.pending = null;
    })();

    await this.pending;

    return this.acquire();
  }

  private prune(now: number): void {
    while (this.timestamps.length > 0 && now - this.timestamps[0] >= this.intervalMs) {
      this.timestamps.shift();
    }
  }
}
