import { describe, expect, it } from "vitest";
import { validateAppConfig } from "./config";

const valid = { schemaVersion: 1, title: "BatteryAI", modelProfile: "oxford-v1", inputMethods: ["upload"], automaticFallback: true, localEndpoint: "http://127.0.0.1:8000", llm: { provider: "webllm", model: "verified", temperature: .1, maxTokens: 400 }, suggestions: { enabled: true, rawRowsIncluded: false } };
describe("configuration validation", () => {
  it("accepts the strict contract", () => expect(validateAppConfig(valid).title).toBe("BatteryAI"));
  it("rejects unknown fields and network endpoints", () => { expect(() => validateAppConfig({ ...valid, extra: true })).toThrow(/unknown/); expect(() => validateAppConfig({ ...valid, localEndpoint: "http://192.168.1.2:8000" })).toThrow(/loopback/); });
});
