import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dashboardPath } from "../routes";
import { LandingPage } from "./LandingPage";

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
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1, name: /batteryai/i })).toBeInTheDocument();
    expect(screen.getByText("Battery intelligence for confident decisions.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes no internal implementation terminology", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    for (const term of internalTerms) expect(text.toLowerCase()).not.toContain(term.toLowerCase());
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

  it("offers no sign-in, registration, contact, or deployment-request form", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    for (const pattern of [/sign ?in/i, /log ?in/i, /sign ?up/i, /register/i, /request deployment/i, /execute request/i, /contact/i]) {
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

  it("presents the product value, workflow, and benefits", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: "Battery health analysis" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clear results" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Actionable insights" })).toBeInTheDocument();
    for (const step of ["Upload battery data", "Validate the dataset", "Run the analysis", "Review results and insights"]) {
      expect(screen.getByRole("heading", { name: step })).toBeInTheDocument();
    }
    expect(screen.getByText("Prediction uncertainty on every estimate")).toBeInTheDocument();
  });

  it("exposes an accessible dashboard call to action derived from the Vite base", () => {
    render(<LandingPage />);
    const ctas = screen.getAllByRole("link", { name: "Open Dashboard" });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", dashboardPath());
    expect(screen.getByRole("link", { name: "See How It Works" })).toHaveAttribute("href", "#how-it-works");
  });

  it("resolves every internal link under the production repository subpath", () => {
    vi.stubEnv("BASE_URL", "/BatteryAI/");
    const { container } = render(<LandingPage />);
    const hrefs = [...container.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href") ?? "");
    expect(hrefs).toContain("/BatteryAI/dashboard/");
    expect(hrefs).toContain("/BatteryAI/");
    for (const href of hrefs) expect(href === "/BatteryAI/" || href.startsWith("/BatteryAI/") || href.startsWith("#")).toBe(true);
  });

  it("loads no CDN script or remote stylesheet", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("link[rel='stylesheet']")).toBeNull();
    expect(container.innerHTML).not.toContain("cdn.tailwindcss.com");
  });
});
