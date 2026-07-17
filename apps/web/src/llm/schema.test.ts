import { describe, expect, it } from "vitest";
import { parseSuggestions } from "./schema";

describe("suggestion safety schema", () => {
  it("accepts plain structured fields", () => expect(parseSuggestions('{"summary":"Review","actions":["Inspect"],"cautions":["Not certified"]}').summary).toBe("Review"));
  it("trims valid surrounding whitespace", () => expect(parseSuggestions({ summary: " Review ", actions: [" Inspect "], cautions: [" Uncertain "] })).toEqual({ summary: "Review", actions: ["Inspect"], cautions: ["Uncertain"] }));
  it("rejects empty actions or cautions", () => {
    expect(() => parseSuggestions({ summary: "Review", actions: [], cautions: ["Uncertain"] })).toThrow(/schema/);
    expect(() => parseSuggestions({ summary: "Review", actions: ["Inspect"], cautions: [] })).toThrow(/schema/);
  });
  it("rejects whitespace-only content", () => {
    expect(() => parseSuggestions({ summary: " ", actions: ["Inspect"], cautions: ["Uncertain"] })).toThrow(/schema/);
    expect(() => parseSuggestions({ summary: "Review", actions: [" "], cautions: ["Uncertain"] })).toThrow(/schema/);
    expect(() => parseSuggestions({ summary: "Review", actions: ["Inspect"], cautions: [" "] })).toThrow(/schema/);
  });
  it("rejects generated HTML-shaped output", () => expect(() => parseSuggestions('{"html":"<img onerror=alert(1)>"}')).toThrow(/schema/));
  it("rejects HTML inside otherwise valid fields", () => expect(() => parseSuggestions({ summary: "<b>unsafe</b>", actions: ["Inspect"], cautions: ["Uncertain"] })).toThrow(/schema/));
  it("rejects extra fields and unbounded output", () => {
    expect(() => parseSuggestions('{"summary":"x","actions":["Inspect"],"cautions":["Uncertain"],"predicted_soh":1}')).toThrow(/schema/);
    expect(() => parseSuggestions(JSON.stringify({ summary: "x".repeat(1001), actions: ["Inspect"], cautions: ["Uncertain"] }))).toThrow(/schema/);
  });
});
