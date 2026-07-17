import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OLLAMA_MODEL } from "../llm/provider";
import { dashboardPath } from "../routes";
import { LandingPage } from "./LandingPage";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("landing page", () => {
  it("renders the product hero without contacting any backend", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1, name: /batteryai/i })).toBeInTheDocument();
    expect(screen.getByText("Physics-informed battery health intelligence")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers no sign-in, registration, contact, or deployment-request form", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    for (const pattern of [/organization/i, /e-?mail/i, /password/i, /username/i]) expect(screen.queryByLabelText(pattern)).not.toBeInTheDocument();
    for (const pattern of [/sign ?in/i, /log ?in/i, /sign ?up/i, /register/i, /request deployment/i, /execute request/i, /contact/i]) {
      expect(screen.queryByRole("button", { name: pattern })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: pattern })).not.toBeInTheDocument();
    }
  });

  it("makes no unsupported marketing or telemetry claim", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    for (const claim of ["99.8", "Transformer-V4", "TRANSFORMER-V4", "Adaptive Charging", "ADAPTIVE CHARGING", "LIVE DATA STREAM", "SYSTEMS NOMINAL", "SYSTEM ONLINE", "MODEL V4.2", "Thermal Optimization", "EFFICIENCY GAIN", "uptime", "Cycle Life"]) {
      expect(text).not.toContain(claim);
    }
    expect(text).not.toMatch(/\d+(\.\d+)?\s*%\s*accuracy/i);
  });

  it("states the real architecture and where the model runs", () => {
    render(<LandingPage />);
    expect(screen.getByText("GitHub Pages does not run the numerical model.")).toBeInTheDocument();
    expect(screen.getByText("The host computer performs all inference.")).toBeInTheDocument();
    expect(screen.getByText("Ollama is contacted only by the FastAPI service, over loopback.")).toBeInTheDocument();
    expect(screen.getByText("The browser never contacts Ollama directly.")).toBeInTheDocument();
    expect(screen.getByText("Remote use requires the host computer to remain online.")).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(OLLAMA_MODEL.replace(".", "\\.")))).not.toHaveLength(0);
  });

  it("shows the supported capability matrix, including what is unavailable", () => {
    render(<LandingPage />);
    expect(screen.getByText("Remaining useful life")).toBeInTheDocument();
    expect(screen.getByText("Unavailable for Oxford V1")).toBeInTheDocument();
    for (const expert of ["core_operational", "diagnostic_curve", "usage_aging", "residual"]) expect(screen.getByText(expert)).toBeInTheDocument();
  });

  it("discloses the model and deployment limitations", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: /limitations/i })).toBeInTheDocument();
    expect(screen.getByText("RUL is not trained or operational.")).toBeInTheDocument();
    expect(screen.getByText("Predictions are decision support, not a safety certification.")).toBeInTheDocument();
    expect(screen.getByText("Synthetic CSV examples exercise the pipeline; they are not evidence of model performance.")).toBeInTheDocument();
    expect(screen.getByText(/not an unbiased evaluation set/)).toBeInTheDocument();
    expect(screen.getByText(/host computer staying online/)).toBeInTheDocument();
  });

  it("exposes an accessible dashboard call to action derived from the Vite base", () => {
    render(<LandingPage />);
    const ctas = screen.getAllByRole("link", { name: "Open Dashboard" });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", dashboardPath());
    expect(screen.getByRole("link", { name: "View Architecture" })).toHaveAttribute("href", "#architecture");
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
