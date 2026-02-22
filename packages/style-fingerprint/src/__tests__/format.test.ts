import { describe, it, expect } from "vitest";
import { formatStyleProfile, describeScale } from "../format.js";
import { analyzeStyle } from "../analyze.js";

const SAMPLE = `
The weather turned cold overnight. I wasn't ready for it — none of us were.

We scrambled to find jackets, boots, anything warm. It's the kind of morning that makes you appreciate a good cup of coffee. Seriously, what would we do without it?

By noon the sun came out and everything was fine again. Classic autumn.
`;

describe("describeScale", () => {
  it("describes low values", () => {
    expect(describeScale(0.1, "terse", "verbose")).toContain("terse");
  });

  it("describes somewhat low values", () => {
    expect(describeScale(0.3, "terse", "verbose")).toContain("somewhat terse");
  });

  it("describes moderate values", () => {
    expect(describeScale(0.5, "terse", "verbose")).toContain("moderate");
  });

  it("describes somewhat high values", () => {
    expect(describeScale(0.7, "terse", "verbose")).toContain("somewhat verbose");
  });

  it("describes high values", () => {
    expect(describeScale(0.9, "terse", "verbose")).toContain("verbose");
  });

  it("includes numeric value", () => {
    const result = describeScale(0.42, "low", "high");
    expect(result).toContain("0.42");
  });
});

describe("formatStyleProfile", () => {
  const profile = analyzeStyle([SAMPLE]);

  it("formats in prompt mode", () => {
    const output = formatStyleProfile(profile, "prompt");
    expect(output).toContain("STYLE PROFILE:");
    expect(output).toContain("Verbosity:");
    expect(output).toContain("DETAILED METRICS:");
    expect(output).toContain("Average sentence length:");
  });

  it("formats in detailed mode", () => {
    const output = formatStyleProfile(profile, "detailed");
    expect(output).toContain("Style Profile v1");
    expect(output).toContain("── Dimensions ──");
    expect(output).toContain("── Patterns ──");
    expect(output).toContain("── Raw Metrics ──");
  });

  it("formats in compact mode", () => {
    const output = formatStyleProfile(profile, "compact");
    expect(output).toContain("w/sentence");
    expect(output).toContain("readability");
    expect(output).toContain("samples");
  });

  it("defaults to prompt mode", () => {
    const output = formatStyleProfile(profile);
    expect(output).toContain("STYLE PROFILE:");
  });
});
