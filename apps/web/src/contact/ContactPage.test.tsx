import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import contactHtml from "../../contact/index.html?raw";
import { contactPath, dashboardPath, landingPath } from "../routes";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "../landing/LandingFooter";
import { ContactPage } from "./ContactPage";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const internalTerms = [
  "Oxford", "Battery-PIMoE", "PIMoE", "Ollama", "llama", "PyTorch", "CUDA", "CPU inference", "FastAPI",
  "checkpoint", "active experts", "masked experts", "model architecture", "model profile", "GitHub Pages",
  "Tailscale", "Funnel", "backend URL", "localhost", "loopback", "RUL",
];

describe("contact page", () => {
  it("renders one clear Contact Re-Li heading without contacting a backend", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { container } = render(<ContactPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Contact Re-Li" })).toBeInTheDocument();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses customer-facing Contact metadata", () => {
    const document = new DOMParser().parseFromString(contactHtml, "text/html");
    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    expect(document.title).toBe("Re-Li | Contact");
    expect(description).toBe("Contact Re-Li to discuss battery-health analysis, demos, technical evaluations, pilots, and partnerships.");
    expect(`${document.title} ${description}`).not.toContain("BatteryAI");
  });

  it("shows the authorized email as selectable text and an exact mailto link", () => {
    render(<ContactPage />);
    const emailLinks = screen.getAllByRole("link", { name: CONTACT_EMAIL });
    expect(emailLinks.length).toBeGreaterThan(0);
    for (const link of emailLinks) expect(link).toHaveAttribute("href", CONTACT_MAILTO);
    expect(screen.getByRole("link", { name: "Email Re-Li" })).toHaveAttribute("href", CONTACT_MAILTO);
  });

  it("renders the four factual contact reasons", () => {
    render(<ContactPage />);
    for (const reason of ["Product Demo", "Battery Data Evaluation", "Pilot Opportunities", "Partnerships"]) {
      expect(screen.getByRole("heading", { name: reason })).toBeInTheDocument();
    }
  });

  it("has no fake form or invented contact information", () => {
    const { container } = render(<ContactPage />);
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).not.toMatch(/phone|telephone|office address|linkedin|instagram|facebook|twitter|founder/i);
    const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href") ?? "");
    expect(hrefs.filter((href) => href.startsWith("mailto:")).every((href) => href === CONTACT_MAILTO)).toBe(true);
  });

  it("exposes no internal implementation terminology, legacy public brand, or em dash", () => {
    const { container } = render(<ContactPage />);
    const text = container.textContent ?? "";
    for (const term of internalTerms) expect(text.toLowerCase()).not.toContain(term.toLowerCase());
    expect(text).not.toMatch(/BatteryAI|BATTERY\/AI|Battery AI/);
    expect(text).not.toContain("\u2014");
  });

  it("uses base-aware landing, dashboard, and Contact links", () => {
    vi.stubEnv("BASE_URL", "/BatteryAI/");
    const { container } = render(<ContactPage />);
    const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href") ?? "");
    expect(hrefs).toContain(landingPath("/BatteryAI/"));
    expect(hrefs).toContain(dashboardPath("/BatteryAI/"));
    expect(hrefs).toContain(contactPath("/BatteryAI/"));
    for (const href of hrefs) expect(href.startsWith("/BatteryAI/") || href.startsWith("mailto:") || href.startsWith("#")).toBe(true);
  });

  it("uses the shared navigation and compact footer", () => {
    render(<ContactPage />);
    const primary = screen.getByRole("navigation", { name: "Primary" });
    expect(within(primary).getAllByRole("link", { name: "Contact" })[0]).toHaveAttribute("aria-current", "page");
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Re-Li" })).toHaveAttribute("href", landingPath());
    expect(within(footer).getByRole("link", { name: CONTACT_EMAIL })).toBeInTheDocument();
  });
});
