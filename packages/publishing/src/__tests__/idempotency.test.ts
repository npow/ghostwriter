import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateIdempotencyKey } from "../idempotency.js";

describe("generateIdempotencyKey", () => {
  it("produces a deterministic key for same inputs", () => {
    const key1 = generateIdempotencyKey("ch1", "ghost", "content-abc");
    const key2 = generateIdempotencyKey("ch1", "ghost", "content-abc");
    expect(key1).toBe(key2);
  });

  it("produces different keys for different channels", () => {
    const key1 = generateIdempotencyKey("ch1", "ghost", "content-abc");
    const key2 = generateIdempotencyKey("ch2", "ghost", "content-abc");
    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different platforms", () => {
    const key1 = generateIdempotencyKey("ch1", "ghost", "content-abc");
    const key2 = generateIdempotencyKey("ch1", "twitter", "content-abc");
    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different content", () => {
    const key1 = generateIdempotencyKey("ch1", "ghost", "content-abc");
    const key2 = generateIdempotencyKey("ch1", "ghost", "content-xyz");
    expect(key1).not.toBe(key2);
  });

  it("key has expected prefix format", () => {
    const key = generateIdempotencyKey("my-channel", "ghost", "hello");
    expect(key).toMatch(/^pub-my-channel-ghost-[a-f0-9]{24}$/);
  });
});
