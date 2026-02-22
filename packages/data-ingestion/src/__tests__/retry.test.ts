import { describe, it, expect, vi } from "vitest";
import { RateLimiter, CircuitBreaker } from "../retry.js";

describe("RateLimiter", () => {
  it("allows requests under the limit", async () => {
    const limiter = new RateLimiter(60); // 60 req/min = 1/sec
    // First request should be immediate
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("exhausts tokens after burst", async () => {
    const limiter = new RateLimiter(6000); // 6000/min = 100/sec, fast refill
    // Drain all tokens
    for (let i = 0; i < 6000; i++) {
      await limiter.acquire();
    }
    // Next request should need to wait for refill
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(0);
  });
});

describe("CircuitBreaker", () => {
  it("allows requests when closed", async () => {
    const cb = new CircuitBreaker(3, 1000);
    const result = await cb.execute(async () => "ok", "test");
    expect(result).toBe("ok");
  });

  it("opens after threshold failures", async () => {
    const cb = new CircuitBreaker(2, 60_000);
    const fail = () => cb.execute(async () => { throw new Error("fail"); }, "test");

    await expect(fail()).rejects.toThrow("fail");
    await expect(fail()).rejects.toThrow("fail");

    // Circuit should now be open
    await expect(fail()).rejects.toThrow("Circuit breaker open");
  });

  it("resets after success", async () => {
    const cb = new CircuitBreaker(3, 60_000);

    // One failure
    await expect(
      cb.execute(async () => { throw new Error("fail"); }, "test")
    ).rejects.toThrow("fail");

    // Followed by success — should reset counter
    const result = await cb.execute(async () => "ok", "test");
    expect(result).toBe("ok");

    // Should still be closed after another failure
    await expect(
      cb.execute(async () => { throw new Error("fail"); }, "test")
    ).rejects.toThrow("fail");

    // Not yet at threshold (only 1 consecutive failure)
    const result2 = await cb.execute(async () => "still ok", "test");
    expect(result2).toBe("still ok");
  });

  it("transitions to half-open after reset timeout", async () => {
    const cb = new CircuitBreaker(1, 50); // 50ms reset

    // Trip the circuit
    await expect(
      cb.execute(async () => { throw new Error("fail"); }, "test")
    ).rejects.toThrow("fail");

    // Should be open
    await expect(
      cb.execute(async () => "ok", "test")
    ).rejects.toThrow("Circuit breaker open");

    // Wait for reset
    await new Promise((r) => setTimeout(r, 60));

    // Should allow test request (half-open)
    const result = await cb.execute(async () => "recovered", "test");
    expect(result).toBe("recovered");
  });
});
