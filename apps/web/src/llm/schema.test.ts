import { describe, expect, it } from "vitest";
import { parseSuggestions } from "./schema";

describe("suggestion safety schema", () => {
  it("accepts plain structured fields", () => expect(parseSuggestions('{"summary":"Review","actions":["Inspect"],"cautions":["Not certified"]}').summary).toBe("Review"));
  it("rejects generated HTML-shaped output", () => expect(() => parseSuggestions('{"html":"<img onerror=alert(1)>"}')).toThrow(/schema/));
  it("rejects HTML inside otherwise valid fields", () => expect(() => parseSuggestions({ summary: "<b>unsafe</b>", actions: [], cautions: [] })).toThrow(/schema/));
  it("rejects extra fields and unbounded output", () => {
    expect(() => parseSuggestions('{"summary":"x","actions":[],"cautions":[],"predicted_soh":1}')).toThrow(/schema/);
    expect(() => parseSuggestions(JSON.stringify({ summary: "x".repeat(1001), actions: [], cautions: [] }))).toThrow(/schema/);
  });
});
