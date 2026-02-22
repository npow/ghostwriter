import { describe, it, expect } from "vitest";
import { resolveTargetId } from "../connections.js";

describe("resolveTargetId", () => {
  it("returns explicit ID when provided", () => {
    expect(resolveTargetId({ platform: "ghost", id: "my-blog" }, 0)).toBe("my-blog");
    expect(resolveTargetId({ platform: "ghost", id: "my-blog" }, 3)).toBe("my-blog");
  });

  it("returns platform name for first target without ID", () => {
    expect(resolveTargetId({ platform: "ghost" }, 0)).toBe("ghost");
    expect(resolveTargetId({ platform: "twitter" }, 0)).toBe("twitter");
  });

  it("returns platform-N for subsequent targets without ID", () => {
    expect(resolveTargetId({ platform: "ghost" }, 1)).toBe("ghost-2");
    expect(resolveTargetId({ platform: "ghost" }, 2)).toBe("ghost-3");
  });
});
