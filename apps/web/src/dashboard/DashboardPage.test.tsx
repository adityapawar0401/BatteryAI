import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { landingPath } from "../routes";
import type { PredictionResult } from "../types";
import { DashboardPage } from "./DashboardPage";
import exampleCsv from "../../public/fixtures/oxford-real-example.csv?raw";
import appConfig from "../../public/config/app.json";
import modelProfile from "../../public/config/oxford-v1.json";
import inputSchema from "../../public/config/oxford-input-schema.json";
import dashboardHtml from "../../dashboard/index.html?raw";

const ACCESS_CODE = "access-code-value";
const SHA = modelProfile.modelSha256;

/** Terms that must never render in the customer-facing dashboard. */
const internalTerms = [
  "Oxford", "PIMoE", "Ollama", "llama3.2", "ONNX", "FastAPI", "Tailscale", "Funnel", "GitHub Pages",
  "CUDA", "checkpoint hash", "SHA-256", "active expert", "masked expert", "model profile", "RUL",
  "next-observed-checkpoint", "loopback", "local LLM", "remote backend", "host computer",
  "inference provider", "browser ML", "ts.net", "PyTorch", "pairing token", "deployment mode",
];

const prediction: PredictionResult = {
  request_id: "request-1", model_profile: "oxford-v1", model_sha256: SHA, backend: "local-pytorch", runtime_device: "cuda:0",
  cell_id: "Cell1", sequence_id: "Cell1:cyc0000->cyc0100", source_checkpoint: "cyc0000", target_checkpoint: "cyc0100",
  predicted_soh: 97.42, predictive_std: 1.83, actual_soh: null, absolute_error: null,
  active_experts: ["core_operational", "diagnostic_curve", "usage_aging", "residual"], warnings: [],
  timing: { preprocessing_ms: 4, inference_ms: 11, total_ms: 15 },
};

const readyInsights = { provider: "ollama", model: "llama3.2:3b", reachable: true, model_installed: true, ready: true, endpoint: "http://127.0.0.1:11434", generation_available: true, reason: null, corrective_command: null, version: "0.30.11" };

function mockStaticFetch(handler?: (url: string, init?: RequestInit) => Response | undefined) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("app.json")) return new Response(JSON.stringify(appConfig));
    if (url.includes("oxford-v1.json")) return new Response(JSON.stringify(modelProfile));
    if (url.includes("oxford-input-schema.json")) return new Response(JSON.stringify(inputSchema));
    if (url.includes("oxford-real-example.csv")) return new Response(exampleCsv);
    const handled = handler?.(url, init as RequestInit);
    if (handled) return handled;
    throw new Error(`Unexpected request: ${url}`);
  });
}

const connectedService = (extra?: (url: string) => Response | undefined) => (url: string): Response | undefined => {
  if (url === "http://127.0.0.1:8000/v1/capabilities") return new Response(JSON.stringify({ ready: true, model_sha256: SHA, device: "cuda:0" }));
  if (url.endsWith("/v1/llm-capabilities")) return new Response(JSON.stringify(readyInsights));
  return extra?.(url);
};

async function renderDashboard(handler?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = mockStaticFetch(handler);
  render(<DashboardPage />);
  await screen.findByRole("heading", { name: "Battery health analysis" });
  return fetchMock;
}

const dataNotice = (): HTMLElement => within(document.getElementById("data")!).getByRole("status");

async function loadExample(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Load example" }));
  await waitFor(() => expect(dataNotice()).toHaveTextContent("3,510 rows added"));
}

async function connect(): Promise<void> {
  fireEvent.change(screen.getByLabelText("Access code"), { target: { value: ACCESS_CODE } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await waitFor(() => expect(screen.getAllByText("Connected").length).toBeGreaterThan(0));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); document.body.className = ""; });
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

describe("dashboard branding", () => {
  it("renders Re-Li in the dashboard header and navigation", async () => {
    await renderDashboard();
    expect(screen.getByRole("heading", { level: 1, name: "Re-Li dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Re-Li" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/BatteryAI|BATTERY\/AI|Battery AI/);
  });

  it("uses Re-Li in dashboard metadata without exposing the legacy public brand", () => {
    const document = new DOMParser().parseFromString(dashboardHtml, "text/html");
    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    expect(document.title).toBe("Re-Li | Dashboard");
    expect(description).toContain("Re-Li dashboard");
    expect(`${document.title} ${description}`).not.toContain("BatteryAI");
  });

  it("uses Re-Li in customer-facing loading and startup failure text", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => undefined));
    const loading = render(<DashboardPage />);
    expect(screen.getByText("Loading Re-Li…")).toBeInTheDocument();
    loading.unmount();
    vi.restoreAllMocks();

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unavailable"));
    render(<DashboardPage />);
    expect(await screen.findByRole("heading", { name: "Re-Li is unavailable" })).toBeInTheDocument();
    expect(screen.getByText("Re-Li could not start. Refresh to try again.")).toBeInTheDocument();
  });
});

describe("dashboard confidentiality", () => {
  it("renders no internal implementation terminology before connecting", async () => {
    await renderDashboard();
    const text = document.body.textContent ?? "";
    for (const term of internalTerms) expect(text.toLowerCase()).not.toContain(term.toLowerCase());
    expect(text).not.toContain("—");
  });

  it("never renders the service address, deployment mode, or a system-status panel", async () => {
    await renderDashboard();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("127.0.0.1");
    expect(text).not.toContain("http://");
    expect(text).not.toContain("https://");
    expect(screen.queryByLabelText(/endpoint/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/backend/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /system status/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/local|remote/i)).not.toBeInTheDocument();
  });

  it("renders no model, device, or checkpoint detail after a completed analysis", async () => {
    await renderDashboard(connectedService((url) => url === "http://127.0.0.1:8000/v1/infer"
      ? new Response(JSON.stringify({ fallback_occurred: false, results: [{ ...prediction, warnings: ["Final-training-cell examples are software fixtures, not unbiased performance estimates."] }] }))
      : undefined));
    await connect();
    await loadExample();
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await waitFor(() => expect(within(document.getElementById("results")!).getByText("97.42")).toBeInTheDocument());

    const text = document.body.textContent ?? "";
    for (const term of [...internalTerms, "cuda:0", "local-pytorch", SHA, SHA.slice(0, 12), "oxford-v1", "training-cell"]) {
      expect(text.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it("shows only a generic operational state", async () => {
    await renderDashboard();
    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Disconnected")).toBeInTheDocument();
    expect(header.getByText("Unavailable")).toBeInTheDocument();
  });

  it("keeps the customer navigation free of technical destinations", async () => {
    await renderDashboard();
    for (const label of ["Overview", "Data", "Validation", "Results", "Insights"]) {
      const link = screen.getByRole("link", { name: label });
      expect(document.getElementById(link.getAttribute("href")?.slice(1) ?? "")).not.toBeNull();
    }
    for (const label of [/system status/i, /architecture/i, /model capabilit/i, /configuration/i, /telemetry/i]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /Back to landing page/ })).toHaveAttribute("href", landingPath());
  });
});

describe("dashboard connection", () => {
  it("connects using the unchanged pairing header and keeps the code in sessionStorage only", async () => {
    let sentHeader: string | undefined;
    await renderDashboard((url, init) => {
      if (url === "http://127.0.0.1:8000/v1/capabilities") {
        sentHeader = (init?.headers as Record<string, string>)["X-BatteryAI-Token"];
        return new Response(JSON.stringify({ ready: true, model_sha256: SHA, device: "cuda:0" }));
      }
      if (url.endsWith("/v1/llm-capabilities")) return new Response(JSON.stringify(readyInsights));
      return undefined;
    });
    await connect();
    expect(sentHeader).toBe(ACCESS_CODE);
    expect(sessionStorage.getItem("batteryai-pairing-token")).toBe(ACCESS_CODE);
    expect(localStorage.length).toBe(0);
    expect(screen.getByLabelText("Access code")).toHaveAttribute("type", "password");
    expect(document.body.textContent).not.toContain(ACCESS_CODE);
  });

  it("sends no protected request before connecting", async () => {
    const fetchMock = await renderDashboard();
    await loadExample();
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connect to the analysis service before running an analysis.");
    for (const call of fetchMock.mock.calls) expect(String(call[0])).not.toContain("/v1/");
  });

  it("reports a rejected access code in customer language", async () => {
    await renderDashboard((url) => url === "http://127.0.0.1:8000/v1/capabilities"
      ? new Response(JSON.stringify({ message: "Pairing token rejected." }), { status: 401 })
      : undefined);
    fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The access code is invalid or has expired.");
    expect(alert.textContent?.toLowerCase()).not.toContain("token");
  });
});

describe("dashboard data workflow", () => {
  it("loads the example, validates it, and charts only the supplied data", async () => {
    await renderDashboard();
    expect(screen.getByText(/Charts appear once battery data is added/)).toBeInTheDocument();
    await loadExample();
    fireEvent.click(screen.getByRole("button", { name: "Validate data" }));
    await waitFor(() => expect(dataNotice()).toHaveTextContent("3,510 rows passed validation"));
    expect(within(document.getElementById("validation")!).getByText("Validation passed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Input Data Preview" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Voltage against point index\. 3,510 supplied points/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Capacity coordinate against point index/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Temperature against point index/ })).toBeInTheDocument();
  });

  it("reports the real dataset contract for correcting input", async () => {
    await renderDashboard();
    await loadExample();
    const validation = within(document.getElementById("validation")!);
    expect(validation.getByText("3,510")).toBeInTheDocument();
    expect(validation.getByText("Cell1:cyc0000->cyc0100")).toBeInTheDocument();
    expect(validation.getByText("C1ch")).toBeInTheDocument();
    expect(validation.getByText("cyc0000")).toBeInTheDocument();
    expect(validation.getByText("cyc0100")).toBeInTheDocument();
    expect(validation.queryByText("Reference SOH supplied")).not.toBeInTheDocument();
  });

  it("surfaces validation errors verbatim so the file can be fixed", async () => {
    await renderDashboard();
    fireEvent.click(screen.getByRole("tab", { name: "Paste CSV" }));
    fireEvent.change(screen.getByLabelText("CSV text"), {
      target: { value: "sequence_id,cell_id,source_checkpoint,target_checkpoint,modality,point_index,time_s,voltage_V,capacity_Ah,temperature_K,actual_soh\ns,c,a,b,C1ch,0,0,99,0,298.15,\ns,c,a,b,C1ch,1,1,3.5,0,298.15," } });
    fireEvent.click(screen.getByRole("button", { name: "Parse pasted CSV" }));
    fireEvent.click(screen.getByRole("button", { name: "Validate data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Row 1, voltage_V: expected volts between 0 and 10.");
  });

  it("keeps the CSV format help and the editable table available", async () => {
    await renderDashboard();
    const help = screen.getByText("Re-Li CSV format").closest("details")!;
    for (const field of ["sequence_id", "cell_id", "source_checkpoint", "target_checkpoint", "modality", "point_index", "time_s", "voltage_V", "capacity_Ah", "temperature_K", "actual_soh"]) {
      expect(within(help).getByText(new RegExp(`^${field}`))).toBeInTheDocument();
    }
    expect(help.textContent?.toLowerCase()).not.toContain("oxford");
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    const voltage = await screen.findByLabelText("Voltage row 1");
    fireEvent.change(voltage, { target: { value: "3.9" } });
    expect(screen.getByLabelText("Voltage row 1")).toHaveValue("3.9");
  });
});

describe("dashboard results", () => {
  it("emphasizes the unchanged estimated SOH without rendering numerical uncertainty", async () => {
    await renderDashboard(connectedService((url) => url === "http://127.0.0.1:8000/v1/infer"
      ? new Response(JSON.stringify({ fallback_occurred: false, results: [prediction] }))
      : undefined));
    await connect();
    await loadExample();
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    const results = () => within(document.getElementById("results")!);
    await waitFor(() => expect(results().getByText("97.42")).toBeInTheDocument());
    expect(results().getByText("% estimated state of health")).toBeInTheDocument();
    expect(results().queryByText("Uncertainty")).not.toBeInTheDocument();
    expect(results().queryByText(/1\.83 pp/)).not.toBeInTheDocument();
    expect(results().getByText("cyc0000")).toBeInTheDocument();
    expect(results().getByText("cyc0100")).toBeInTheDocument();
    expect(results().getAllByText("Completed").length).toBeGreaterThan(0);
  });

  it("never renders reference SOH or absolute error even when supplied", async () => {
    let payload: PredictionResult = prediction;
    await renderDashboard(connectedService((url) => url === "http://127.0.0.1:8000/v1/infer"
      ? new Response(JSON.stringify({ fallback_occurred: false, results: [payload] }))
      : undefined));
    await connect();
    await loadExample();
    const results = () => within(document.getElementById("results")!);
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await waitFor(() => expect(results().getByText("97.42")).toBeInTheDocument());
    expect(results().queryByText("Reference SOH")).not.toBeInTheDocument();
    expect(results().queryByText("Absolute error")).not.toBeInTheDocument();

    payload = { ...prediction, actual_soh: 96.1, absolute_error: 1.32 };
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    expect(results().getByText(/Analyzing your battery data/)).toBeInTheDocument();
    await waitFor(() => expect(results().queryByText(/Analyzing your battery data/)).not.toBeInTheDocument());
    expect(results().queryByText("Reference SOH")).not.toBeInTheDocument();
    expect(results().queryByText("Absolute error")).not.toBeInTheDocument();
    expect(results().queryByText("96.10%")).not.toBeInTheDocument();
    expect(results().queryByText("1.32 pp")).not.toBeInTheDocument();
    expect(results().getByText("97.42")).toBeInTheDocument();
  });

  it("reports an unavailable service in customer language", async () => {
    await renderDashboard(connectedService((url) => url === "http://127.0.0.1:8000/v1/infer"
      ? new Response(JSON.stringify({ message: "Rate limit exceeded." }), { status: 429 })
      : undefined));
    await connect();
    await loadExample();
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/busy|unavailable/i);
    for (const term of internalTerms) expect(alert.textContent?.toLowerCase()).not.toContain(term.toLowerCase());
  });
});

describe("dashboard insights", () => {
  const insights = (summary: string, actions: string[], cautions: string[], usage_guidance = "normal_use") => new Response(JSON.stringify({
    provider: "ollama", model: "llama3.2:3b", suggestions: { summary, usage_guidance, actions, cautions },
    timing: { total_ms: 12, ollama_total_ms: 10, load_ms: 0, prompt_eval_count: 20, eval_count: 10 }, done_reason: "stop",
  }));

  async function runAnalysisThen(suggestionResponse: () => Response) {
    await renderDashboard(connectedService((url) => {
      if (url === "http://127.0.0.1:8000/v1/infer") return new Response(JSON.stringify({ fallback_occurred: false, results: [prediction] }));
      if (url.endsWith("/v1/suggestions")) return suggestionResponse();
      return undefined;
    }));
    await connect();
    await loadExample();
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await waitFor(() => expect(within(document.getElementById("results")!).getByText("97.42")).toBeInTheDocument());
  }

  it("renders insights without naming any provider or model", async () => {
    await runAnalysisThen(() => insights(
      "State of health is estimated at 97.42% with moderate uncertainty.",
      ["Review the estimate against expected operating behavior.", "Compare the next result with this estimate."],
      ["Interpret the estimate alongside its uncertainty."],
    ));
    fireEvent.click(await screen.findByRole("button", { name: "Generate insights" }));
    const panel = () => within(document.getElementById("insights")!);
    await waitFor(() => expect(panel().getByText("State of health is estimated at 97.42% with moderate uncertainty.")).toBeInTheDocument());
    expect(panel().getByRole("heading", { name: "Usage Guidance" })).toBeInTheDocument();
    expect(panel().getByText("Normal Use")).toBeInTheDocument();
    expect(panel().queryByText("normal_use")).not.toBeInTheDocument();
    expect(panel().getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(panel().getByRole("heading", { name: "Recommended actions" })).toBeInTheDocument();
    expect(panel().getByRole("heading", { name: "Considerations" })).toBeInTheDocument();
    const text = document.getElementById("insights")!.textContent ?? "";
    for (const term of ["Ollama", "llama3.2", "provider", "local LLM"]) expect(text.toLowerCase()).not.toContain(term.toLowerCase());
    expect(within(document.getElementById("results")!).getByText("97.42")).toBeInTheDocument();
  });

  it("does not render SOC, model-quality, or internal commentary from a generated response", async () => {
    await runAnalysisThen(() => insights(
      "Check State of Charge because the prediction model accuracy may be low.",
      ["Review software calibration history.", "Repeat the health measurement later.", "Compare the next result with this estimate."],
      ["Interpret the estimate alongside its uncertainty.", "The Battery-PIMoE checkpoint has a high error rate."],
    ));
    fireEvent.click(await screen.findByRole("button", { name: "Generate insights" }));
    const panel = () => within(document.getElementById("insights")!);
    await waitFor(() => expect(panel().getByText("Repeat the health measurement later.")).toBeInTheDocument());
    const text = document.getElementById("insights")!.textContent ?? "";
    for (const term of ["SOC", "State of Charge", "model accuracy", "software", "calibration", "PIMoE", "checkpoint", "error rate"]) expect(text.toLowerCase()).not.toContain(term.toLowerCase());
    expect(panel().getByText("Interpret the estimate alongside its uncertainty.")).toBeInTheDocument();
    expect(panel().getByText("Repeat the health measurement later.")).toBeInTheDocument();
    // The numerical result is untouched by insight filtering.
    expect(within(document.getElementById("results")!).getByText("97.42")).toBeInTheDocument();
  });

  it("renders a safe error rather than incomplete guidance after defensive filtering", async () => {
    await runAnalysisThen(() => insights(
      "State of health is estimated at 97.42%.",
      ["Model limitations: RUL unavailable.", "Review the software calibration."],
      ["Interpret the estimate alongside its uncertainty."],
    ));
    fireEvent.click(await screen.findByRole("button", { name: "Generate insights" }));
    const panel = () => within(document.getElementById("insights")!);
    expect(await panel().findByRole("alert")).toHaveTextContent("AI insights are temporarily unavailable.");
    expect(panel().queryByRole("heading", { name: "Recommended actions" })).not.toBeInTheDocument();
    expect(panel().queryByRole("heading", { name: "Considerations" })).not.toBeInTheDocument();
  });

  it("keeps the retry path for incomplete generated output", async () => {
    let call = 0;
    await runAnalysisThen(() => {
      call += 1;
      return call === 1
        ? insights("Incomplete", [], ["Uncertain"])
        : insights("State of health is estimated at 97.42%.", ["Repeat the analysis at the next measurement.", "Compare the next result with this estimate."], ["Interpret the estimate alongside its uncertainty."]);
    });
    fireEvent.click(await screen.findByRole("button", { name: "Generate insights" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI insights are temporarily unavailable.");
    fireEvent.click(screen.getByRole("button", { name: "Generate insights" }));
    await waitFor(() => expect(within(document.getElementById("insights")!).getByText("State of health is estimated at 97.42%.")).toBeInTheDocument());
    expect(within(document.getElementById("results")!).getByText("97.42")).toBeInTheDocument();
  });
});

describe("dashboard navigation", () => {
  it("keeps the mobile navigation reachable, dismissable, and scroll-locking", async () => {
    await renderDashboard();
    const toggle = screen.getByRole("button", { name: "Open navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.body).toHaveClass("scroll-locked");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
    expect(document.body).not.toHaveClass("scroll-locked");
  });
});
