import { describe, it, expect } from "vitest";
import { contentHash } from "../cache.js";

describe("contentHash", () => {
  it("produces a deterministic hash", () => {
    const hash1 = contentHash("hello world");
    const hash2 = contentHash("hello world");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different content", () => {
    const hash1 = contentHash("hello world");
    const hash2 = contentHash("goodbye world");
    expect(hash1).not.toBe(hash2);
  });

  it("produces a 16-character hex string", () => {
    const hash = contentHash("test content");
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("handles empty string", () => {
    const hash = contentHash("");
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("handles unicode content", () => {
    const hash = contentHash("日本語テスト");
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });
});
