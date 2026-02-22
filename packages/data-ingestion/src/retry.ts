import { createChildLogger } from "@ghostwriter/core";

const logger = createChildLogger({ module: "data-ingestion:retry" });

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: (error: unknown) => boolean;
}

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
};

/**
 * Retry a function with exponential backoff.
 * Distinguishes transient errors (retry) from permanent errors (fail immediately).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: unknown;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if this is a permanent error (don't retry)
      if (isPermanentError(error)) {
        logger.error(
          { label, attempt, error: formatError(error) },
          "Permanent error, not retrying"
        );
        throw error;
      }

      // Check custom retryable filter
      if (opts.retryableErrors && !opts.retryableErrors(error)) {
        throw error;
      }

      if (attempt === opts.maxAttempts) {
        logger.error(
          { label, attempt, error: formatError(error) },
          "Max retries exhausted"
        );
        break;
      }

      // Add jitter: ±25% of delay
      const jitter = delay * (0.75 + Math.random() * 0.5);
      logger.warn(
        { label, attempt, nextRetryMs: Math.round(jitter), error: formatError(error) },
        "Retrying after error"
      );

      await sleep(jitter);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Simple token bucket rate limiter.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(requestsPerMinute: number) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.refillRate = requestsPerMinute / 60_000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait for a token to become available
    const waitMs = (1 - this.tokens) / this.refillRate;
    await sleep(waitMs);
    this.refill();
    this.tokens -= 1;
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

// Global rate limiters per provider
const rateLimiters = new Map<string, RateLimiter>();

export function getRateLimiter(
  provider: string,
  requestsPerMinute = 60
): RateLimiter {
  let limiter = rateLimiters.get(provider);
  if (!limiter) {
    limiter = new RateLimiter(requestsPerMinute);
    rateLimiters.set(provider, limiter);
  }
  return limiter;
}

/**
 * Simple circuit breaker.
 * After `threshold` consecutive failures, opens the circuit for `resetMs`.
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(
    private readonly threshold: number = 5,
    private readonly resetMs: number = 60_000
  ) {}

  async execute<T>(fn: () => Promise<T>, label: string): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailure > this.resetMs) {
        this.state = "half-open";
        logger.info({ label }, "Circuit breaker half-open, allowing test request");
      } else {
        throw new Error(`Circuit breaker open for "${label}" — source unavailable`);
      }
    }

    try {
      const result = await fn();
      this.failures = 0;
      this.state = "closed";
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();

      if (this.failures >= this.threshold) {
        this.state = "open";
        logger.error(
          { label, failures: this.failures },
          "Circuit breaker opened"
        );
      }

      throw error;
    }
  }
}

// Global circuit breakers per provider
const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(provider: string): CircuitBreaker {
  let cb = circuitBreakers.get(provider);
  if (!cb) {
    cb = new CircuitBreaker();
    circuitBreakers.set(provider, cb);
  }
  return cb;
}

function isPermanentError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Auth errors, not found, bad request — don't retry
    if (msg.includes("401") || msg.includes("403") || msg.includes("404")) return true;
    if (msg.includes("invalid api key") || msg.includes("unauthorized")) return true;
  }
  return false;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
