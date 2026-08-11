import { describe, expect, it } from "vitest";
import { parseSuggestions, usageGuidanceLabels } from "./schema";

const valid = { summary: "Review", usage_guidance: "normal_use", actions: ["Inspect", "Monitor"], cautions: ["Uncertain"] } as const;

describe("suggestion safety schema", () => {
  it("accepts plain structured fields", () => expect(parseSuggestions(valid).summary).toBe("Review"));
  it("accepts only the four usage guidance values", () => {
    for (const guidance of ["normal_use", "monitor_more_closely", "conservative_use", "service_or_replacement_review"]) {
      expect(parseSuggestions({ ...valid, usage_guidance: guidance }).usage_guidance).toBe(guidance);
    }
    expect(() => parseSuggestions({ ...valid, usage_guidance: "replace_now" })).toThrow(/schema/);
    expect(usageGuidanceLabels).toEqual({
      normal_use: "Normal Use",
      monitor_more_closely: "Monitor More Closely",
      conservative_use: "Conservative Use",
      service_or_replacement_review: "Service / Replacement Review",
    });
  });
  it("trims whitespace and normalizes generated em dashes", () => expect(parseSuggestions({ ...valid, summary: " Review — monitor ", actions: [" Inspect — later ", " Monitor "], cautions: [" Uncertain "] })).toEqual({ summary: "Review, monitor", usage_guidance: "normal_use", actions: ["Inspect, later", "Monitor"], cautions: ["Uncertain"] }));
  it("rejects empty actions or cautions", () => {
    expect(() => parseSuggestions({ ...valid, actions: [] })).toThrow(/schema/);
    expect(() => parseSuggestions({ ...valid, actions: ["Inspect"] })).toThrow(/schema/);
    expect(() => parseSuggestions({ ...valid, cautions: [] })).toThrow(/schema/);
  });
  it("rejects whitespace-only content", () => {
    expect(() => parseSuggestions({ ...valid, summary: " " })).toThrow(/schema/);
    expect(() => parseSuggestions({ ...valid, actions: [" ", "Monitor"] })).toThrow(/schema/);
    expect(() => parseSuggestions({ ...valid, cautions: [" "] })).toThrow(/schema/);
  });
  it("rejects generated HTML-shaped output", () => expect(() => parseSuggestions('{"html":"<img onerror=alert(1)>"}')).toThrow(/schema/));
  it("rejects HTML inside otherwise valid fields", () => expect(() => parseSuggestions({ ...valid, summary: "<b>unsafe</b>" })).toThrow(/schema/));
  it("rejects a multi-paragraph summary", () => expect(() => parseSuggestions({ ...valid, summary: "First.\nSecond." })).toThrow(/schema/));
  it("rejects extra fields and unbounded output", () => {
    expect(() => parseSuggestions({ ...valid, predicted_soh: 1 })).toThrow(/schema/);
    expect(() => parseSuggestions({ ...valid, summary: "x".repeat(1001) })).toThrow(/schema/);
  });
});
