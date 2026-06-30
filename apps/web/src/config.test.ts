import { describe, expect, it } from "vitest";
import { applyBuildDeploymentConfig, isLoopbackEndpoint, validateAppConfig, validateRemoteApiUrl } from "./config";

const valid = { schemaVersion: 1, title: "BatteryAI", modelProfile: "oxford-v1", inputMethods: ["upload"], automaticFallback: true, localEndpoint: "http://127.0.0.1:8000", remoteEnabled: false, remoteApiUrl: null, suggestions: { enabled: true, rawRowsIncluded: false } };
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
  it("accepts only exact HTTPS ts.net remote origins", () => {
    expect(validateRemoteApiUrl("https://battery.example.ts.net")).toBe("https://battery.example.ts.net");
    for (const value of ["http://battery.ts.net", "https://example.com", "https://user:pass@battery.ts.net", "https://battery.ts.net/api", "https://battery.ts.net?q=1", "https://battery.ts.net/#x"]) expect(() => validateRemoteApiUrl(value)).toThrow();
  });
  it("fails a remote production configuration without its validated public URL", () => {
    expect(() => applyBuildDeploymentConfig(valid, { VITE_BATTERYAI_REMOTE_MODE: "1" })).toThrow(/requires/);
    expect(applyBuildDeploymentConfig(valid, { VITE_BATTERYAI_REMOTE_MODE: "1", VITE_BATTERYAI_REMOTE_API_URL: "https://battery.example.ts.net" }).remoteEnabled).toBe(true);
  });
});
