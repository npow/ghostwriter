import { describe, it, expect } from "vitest";
import { formatInsightsForPrompt } from "../performance-insights.js";
import type { PerformanceInsights } from "../performance-insights.js";

describe("formatInsightsForPrompt", () => {
  it("returns empty string when no publications", () => {
    const insights: PerformanceInsights = {
      channelId: "test",
      totalPublications: 0,
      avgEngagement: {
        avgViews: 0,
        avgLikes: 0,
        avgShares: 0,
        avgComments: 0,
        engagementRate: 0,
      },
      topPerformers: [],
      bottomPerformers: [],
      patterns: [],
      recommendations: [],
    };
    expect(formatInsightsForPrompt(insights)).toBe("");
  });

  it("formats insights with engagement data", () => {
    const insights: PerformanceInsights = {
      channelId: "test",
      totalPublications: 10,
      avgEngagement: {
        avgViews: 1000,
        avgLikes: 50,
        avgShares: 20,
        avgComments: 10,
        engagementRate: 0.08,
      },
      topPerformers: [
        {
          publicationId: "p1",
          platform: "ghost",
          headline: "How AI Is Changing Everything",
          engagementScore: 5.2,
          views: 2000,
          likes: 100,
          shares: 50,
          comments: 25,
          reviewScores: null,
        },
      ],
      bottomPerformers: [],
      patterns: [
        {
          pattern: "hookStrength",
          description: "Higher hookStrength scores correlate with better engagement (r=0.72)",
          correlation: "positive",
          strength: "strong",
        },
      ],
      recommendations: ["Focus on stronger hooks."],
    };

    const output = formatInsightsForPrompt(insights);
    expect(output).toContain("PERFORMANCE INSIGHTS FROM PAST CONTENT:");
    expect(output).toContain("10 published pieces");
    expect(output).toContain("8.0%");
    expect(output).toContain("How AI Is Changing Everything");
    expect(output).toContain("hookStrength");
    expect(output).toContain("Focus on stronger hooks.");
  });

  it("includes top performers section", () => {
    const insights: PerformanceInsights = {
      channelId: "test",
      totalPublications: 5,
      avgEngagement: {
        avgViews: 500,
        avgLikes: 25,
        avgShares: 10,
        avgComments: 5,
        engagementRate: 0.08,
      },
      topPerformers: [
        {
          publicationId: "p1",
          platform: "ghost",
          headline: "Top Article",
          engagementScore: 3.0,
          views: 1000,
          likes: 60,
          shares: 30,
          comments: 15,
          reviewScores: null,
        },
        {
          publicationId: "p2",
          platform: "ghost",
          headline: "Second Best",
          engagementScore: 2.5,
          views: 800,
          likes: 40,
          shares: 20,
          comments: 10,
          reviewScores: null,
        },
      ],
      bottomPerformers: [],
      patterns: [],
      recommendations: [],
    };

    const output = formatInsightsForPrompt(insights);
    expect(output).toContain("Top performing headlines:");
    expect(output).toContain("Top Article");
    expect(output).toContain("Second Best");
  });
});
