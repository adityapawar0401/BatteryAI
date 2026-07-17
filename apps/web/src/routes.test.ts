import { describe, expect, it } from "vitest";
import { assetPath, dashboardPath, landingPath, normalizeBase, resolveFromBase } from "./routes";

describe("repository-subpath routing", () => {
  it("resolves production GitHub Pages routes under the repository base", () => {
    expect(landingPath("/BatteryAI/")).toBe("/BatteryAI/");
    expect(dashboardPath("/BatteryAI/")).toBe("/BatteryAI/dashboard/");
    expect(assetPath("config/app.json", "/BatteryAI/")).toBe("/BatteryAI/config/app.json");
  });

  it("resolves local development routes at the server root", () => {
    expect(landingPath("/")).toBe("/");
    expect(dashboardPath("/")).toBe("/dashboard/");
    expect(assetPath("fixtures/oxford-real-example.csv", "/")).toBe("/fixtures/oxford-real-example.csv");
  });

  it("normalizes bases that lack delimiters instead of emitting root-relative or doubled slashes", () => {
    expect(normalizeBase("BatteryAI")).toBe("/BatteryAI/");
    expect(normalizeBase("/BatteryAI")).toBe("/BatteryAI/");
    expect(normalizeBase(undefined)).toBe("/");
    expect(normalizeBase("")).toBe("/");
    expect(normalizeBase("./")).toBe("/");
    expect(resolveFromBase("/config/app.json", "/BatteryAI/")).toBe("/BatteryAI/config/app.json");
  });

  it("never produces a domain-root path that ignores the repository subpath", () => {
    for (const path of [landingPath("/BatteryAI/"), dashboardPath("/BatteryAI/"), assetPath("config/oxford-v1.json", "/BatteryAI/")]) {
      expect(path.startsWith("/BatteryAI/")).toBe(true);
      expect(path.startsWith("//")).toBe(false);
    }
  });

  it("uses the build-time base by default", () => {
    expect(dashboardPath()).toBe(`${normalizeBase(import.meta.env.BASE_URL)}dashboard/`);
  });
});
