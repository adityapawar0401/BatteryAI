import { describe, expect, it } from "vitest";
import { parseSuggestions } from "./schema";

describe("suggestion safety schema", () => {
  it("accepts plain structured fields", () => expect(parseSuggestions('{"summary":"Review","actions":["Inspect"],"cautions":["Not certified"]}').summary).toBe("Review"));
  it("rejects generated HTML-shaped output", () => expect(() => parseSuggestions('{"html":"<img onerror=alert(1)>"}')).toThrow(/schema/));
});
