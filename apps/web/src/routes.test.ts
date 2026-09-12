import { describe, expect, it } from "vitest";
import { assetPath, contactPath, dashboardPath, failurePath, landingPath, normalizeBase, resolveFromBase } from "./routes";
import failureHtml from "../failure/index.html?raw";

describe("repository-subpath routing", () => {
  it("resolves production GitHub Pages routes under the repository base", () => {
    expect(landingPath("/BatteryAI/")).toBe("/BatteryAI/");
    expect(dashboardPath("/BatteryAI/")).toBe("/BatteryAI/dashboard/");
    expect(contactPath("/BatteryAI/")).toBe("/BatteryAI/contact/");
    expect(assetPath("config/app.json", "/BatteryAI/")).toBe("/BatteryAI/config/app.json");
  });

  it("resolves local development routes at the server root", () => {
    expect(landingPath("/")).toBe("/");
    expect(dashboardPath("/")).toBe("/dashboard/");
    expect(contactPath("/")).toBe("/contact/");
    expect(assetPath("fixtures/oxford-real-example.csv", "/")).toBe("/fixtures/oxford-real-example.csv");
    expect(failurePath("/")).toBe("/dashboard/#failure-risk");
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
    for (const path of [landingPath("/BatteryAI/"), failurePath("/BatteryAI/"), dashboardPath("/BatteryAI/"), contactPath("/BatteryAI/"), assetPath("config/oxford-v1.json", "/BatteryAI/")]) {
      expect(path.startsWith("/BatteryAI/")).toBe(true);
      expect(path.startsWith("//")).toBe(false);
    }
  });

  it("uses the build-time base by default", () => {
    expect(dashboardPath()).toBe(`${normalizeBase(import.meta.env.BASE_URL)}dashboard/`);
    expect(contactPath()).toBe(`${normalizeBase(import.meta.env.BASE_URL)}contact/`);
  });

  it("keeps the old failure entry as a direct-route dashboard redirect", () => {
    const document = new DOMParser().parseFromString(failureHtml, "text/html");
    expect(document.querySelector('meta[http-equiv="refresh"]')?.getAttribute("content")).toBe("0; url=../dashboard/#failure-risk");
    expect(document.querySelector("a")?.getAttribute("href")).toBe("../dashboard/#failure-risk");
    expect(document.querySelector("#root")?.textContent).not.toContain("Battery Failure Risk");
  });
});
