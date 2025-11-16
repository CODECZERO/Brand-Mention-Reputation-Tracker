import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { logger } from "./logger.js";
import { wait } from "./sleep.js";
import type { RateLimiter } from "./rate-limiter.js";

export interface HttpClientOptions {
  timeoutMs: number;
  maxRetries: number;
  backoffMs: number;
  limiter?: RateLimiter;
}

export class HttpClient {
  private readonly client: AxiosInstance;

  constructor(private readonly options: HttpClientOptions) {
    this.client = axios.create({ timeout: options.timeoutMs });
  }

  async get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.requestWithRetry(() => this.client.get<T>(url, config));
  }

  async requestWithRetry<T>(
    executor: () => Promise<AxiosResponse<T>>,
  ): Promise<AxiosResponse<T>> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.options.maxRetries) {
      try {
        if (this.options.limiter) {
          await this.options.limiter.acquire();
        }
        return await executor();
      } catch (error) {
        lastError = error;
        attempt += 1;

        if (attempt > this.options.maxRetries) {
          break;
        }

        const delay = this.options.backoffMs * 2 ** (attempt - 1);
        logger.warn({ attempt, delay }, "HTTP request failed; retrying");
        await wait(delay);
      }
    }

    throw lastError;
  }
}
