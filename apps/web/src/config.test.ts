import { describe, expect, it } from "vitest";
import { isLoopbackEndpoint, validateAppConfig } from "./config";

const valid = { schemaVersion: 1, title: "BatteryAI", modelProfile: "oxford-v1", inputMethods: ["upload"], automaticFallback: true, localEndpoint: "http://127.0.0.1:8000", suggestions: { enabled: true, rawRowsIncluded: false } };
describe("configuration validation", () => {
  it("accepts the strict contract", () => expect(validateAppConfig(valid).title).toBe("BatteryAI"));
  it("rejects unknown fields and network endpoints", () => { expect(() => validateAppConfig({ ...valid, extra: true })).toThrow(/unknown/); expect(() => validateAppConfig({ ...valid, localEndpoint: "http://192.168.1.2:8000" })).toThrow(/loopback/); });
  it("enforces schema bounds and allowed input methods", () => {
    expect(() => validateAppConfig({ ...valid, inputMethods: ["upload", "upload"] })).toThrow(/core/);
    expect(() => validateAppConfig({ ...valid, obsolete: true })).toThrow(/unknown/);
  });
  it("recognizes loopback endpoints without accepting lookalikes", () => {
    expect(isLoopbackEndpoint("http://localhost:8000")).toBe(true);
    expect(isLoopbackEndpoint("http://localhost.example:8000")).toBe(false);
    expect(isLoopbackEndpoint("https://127.0.0.1:8000")).toBe(false);
  });
});
