import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contactPath, dashboardPath } from "../routes";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "./LandingFooter";
import { LandingPage } from "./LandingPage";
import landingHtml from "../../index.html?raw";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

/** Terms that must never reach a customer-facing page. */
const internalTerms = [
  "Oxford", "PIMoE", "Battery-PIMoE", "Ollama", "llama3.2", "ONNX", "FastAPI", "Tailscale", "Funnel",
  "GitHub Pages", "CUDA", "checkpoint", "SHA-256", "active expert", "masked expert", "model profile",
  "RUL", "next-observed-checkpoint", "loopback", "local LLM", "remote backend", "host computer",
  "inference provider", "browser ML", "ts.net", "PyTorch", "deployment mode",
];

describe("landing page", () => {
  it("renders the product hero without contacting any backend", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { container } = render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Re-Li" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Re-Li" }).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`${new Date().getFullYear()} Re-Li`))).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/BatteryAI|BATTERY\/AI|Battery AI/);
    expect(screen.getByText("Battery health intelligence for better lifecycle decisions.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Re-Li in landing metadata without exposing the legacy public brand", () => {
    const document = new DOMParser().parseFromString(landingHtml, "text/html");
    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    expect(document.title).toBe("Re-Li | Battery health intelligence");
    expect(description).toContain("Re-Li");
    expect(`${document.title} ${description}`).not.toContain("BatteryAI");
  });

  it("exposes no internal implementation terminology", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    for (const term of internalTerms) expect(text.toLowerCase()).not.toContain(term.toLowerCase());
    expect(text).not.toContain("\u2014");
  });

  it("has no architecture, model-capabilities, or technical-limitations section", () => {
    render(<LandingPage />);
    for (const heading of [/architecture/i, /model capabilit/i, /neural infrastructure/i, /limitations/i, /system access/i, /infrastructure/i, /deployment/i]) {
      expect(screen.queryByRole("heading", { name: heading })).not.toBeInTheDocument();
    }
  });

  it("explains no hosting or deployment arrangement", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    for (const phrase of ["must remain online", "runs on the paired", "host computer", "does not run", "self-hosted", "static frontend"]) {
      expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });

  it("offers no sign-in, registration, or fake inquiry form", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    for (const pattern of [/sign ?in/i, /log ?in/i, /sign ?up/i, /register/i, /request deployment/i, /execute request/i]) {
      expect(screen.queryByRole("button", { name: pattern })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: pattern })).not.toBeInTheDocument();
    }
  });

  it("makes no unsupported performance or capability claim", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    for (const claim of ["99.8", "Transformer-V4", "Adaptive Charging", "LIVE DATA STREAM", "SYSTEMS NOMINAL", "SYSTEM ONLINE", "MODEL V4.2", "Thermal Optimization", "EFFICIENCY GAIN", "uptime", "real-time", "thermal runaway", "guaranteed"]) {
      expect(text.toLowerCase()).not.toContain(claim.toLowerCase());
    }
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%\s*accuracy/i);
  });

  it("presents the product value and four-step workflow", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: "What Re-Li Provides" })).toBeInTheDocument();
    for (const offering of ["Battery Health Estimation", "Practical Usage Guidance", "Structured Data Validation", "Clear Analysis Workflow"]) {
      expect(screen.getByRole("heading", { name: offering })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "How It Works" })).toBeInTheDocument();
    for (const step of ["Provide Battery Data", "Validate", "Analyze Battery Health", "Review Guidance"]) {
      expect(screen.getByRole("heading", { name: step })).toBeInTheDocument();
    }
  });

  it("identifies target users without claiming existing customers", () => {
    const { container } = render(<LandingPage />);
    expect(screen.getByRole("heading", { name: "Who It's For" })).toBeInTheDocument();
    for (const audience of ["Battery Development Teams", "Fleet and Asset Teams", "Energy Storage Teams", "Research and Engineering Teams"]) {
      expect(screen.getByRole("heading", { name: audience })).toBeInTheDocument();
    }
    expect(container.textContent).not.toMatch(/trusted by|our customers|used by/i);
  });

  it("renders the Why Re-Li benefits and bottom contact call to action", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: "Why Re-Li" })).toBeInTheDocument();
    expect(screen.getByText("Clear State of Health results")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Have battery data you want to evaluate?" })).toBeInTheDocument();
    expect(screen.getByText("Talk to us about a Re-Li demo, technical evaluation, pilot, or partnership.")).toBeInTheDocument();
  });

  it("exposes an accessible dashboard call to action derived from the Vite base", () => {
    render(<LandingPage />);
    const ctas = screen.getAllByRole("link", { name: "Open Dashboard" });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", dashboardPath());
    const contacts = screen.getAllByRole("link", { name: "Contact Us" });
    expect(contacts).toHaveLength(2);
    for (const contact of contacts) expect(contact).toHaveAttribute("href", contactPath());
  });

  it("provides equivalent desktop and mobile product navigation", () => {
    render(<LandingPage />);
    const primary = screen.getByRole("navigation", { name: "Primary" });
    for (const label of ["Product", "How It Works", "Who It's For", "Contact"]) {
      expect(within(primary).getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("landing-menu")).not.toHaveAttribute("hidden");
  });

  it("shows the authorized contact information in the compact footer", () => {
    render(<LandingPage />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: CONTACT_EMAIL })).toHaveAttribute("href", CONTACT_MAILTO);
    expect(within(footer).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", dashboardPath());
    expect(within(footer).getByRole("link", { name: "Contact" })).toHaveAttribute("href", contactPath());
  });

  it("resolves every internal link under the production repository subpath", () => {
    vi.stubEnv("BASE_URL", "/BatteryAI/");
    const { container } = render(<LandingPage />);
    const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href") ?? "");
    expect(hrefs).toContain("/BatteryAI/dashboard/");
    expect(hrefs).toContain("/BatteryAI/contact/");
    expect(hrefs).toContain("/BatteryAI/");
    for (const href of hrefs) expect(href === "/BatteryAI/" || href.startsWith("/BatteryAI/") || href.startsWith("#") || href.startsWith("mailto:")).toBe(true);
  });

  it("loads no CDN script or remote stylesheet", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("link[rel='stylesheet']")).toBeNull();
    expect(container.innerHTML).not.toContain("cdn.tailwindcss.com");
  });
});
