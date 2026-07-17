import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { landingPath } from "../routes";
import type { PredictionResult } from "../types";
import { DashboardPage } from "./DashboardPage";
import exampleCsv from "../../public/fixtures/oxford-real-example.csv?raw";
import appConfig from "../../public/config/app.json";
import modelProfile from "../../public/config/oxford-v1.json";
import inputSchema from "../../public/config/oxford-input-schema.json";

const TOKEN = "pairing-token-value";
const SHA = modelProfile.modelSha256;

const prediction: PredictionResult = {
  request_id: "request-1", model_profile: "oxford-v1", model_sha256: SHA, backend: "local-pytorch", runtime_device: "cuda:0",
  cell_id: "Cell1", sequence_id: "Cell1:cyc0000->cyc0100", source_checkpoint: "cyc0000", target_checkpoint: "cyc0100",
  predicted_soh: 97.42, predictive_std: 1.83, actual_soh: null, absolute_error: null,
  active_experts: ["core_operational", "diagnostic_curve", "usage_aging", "residual"], warnings: [],
  timing: { preprocessing_ms: 4, inference_ms: 11, total_ms: 15 },
};

/** Serves only the static configuration files; anything else must be an explicit, asserted call. */
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

async function renderDashboard(handler?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = mockStaticFetch(handler);
  render(<DashboardPage />);
  await screen.findByRole("heading", { name: "Prediction summary" });
  return fetchMock;
}

/** The input notice and the suggestion status are both live regions, so scope to the input one. */
const inputNotice = (): HTMLElement => within(document.getElementById("data-input")!).getByRole("status");

async function loadExample(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Load supplied example" }));
  await waitFor(() => expect(inputNotice()).toHaveTextContent("3,510 rows parsed"));
}

async function pair(): Promise<void> {
  fireEvent.change(screen.getByLabelText("Pairing token"), { target: { value: TOKEN } });
  fireEvent.click(screen.getByRole("button", { name: "Test & pair host engine" }));
  await screen.findByText(/Paired with cuda:0/);
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); document.body.className = ""; });
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

describe("dashboard shell", () => {
  it("shows real deployment state and no fabricated telemetry", async () => {
    await renderDashboard();
    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Local")).toBeInTheDocument();
    expect(header.getByText("http://127.0.0.1:8000")).toBeInTheDocument();
    expect(header.getByText("Unpaired")).toBeInTheDocument();
    const body = document.body.textContent ?? "";
    for (const fake of ["LIVE DATA STREAM", "SYSTEM HEALTH", "98.4", "84.2", "Cycle Life", "1,204", "99.8", "Transformer-V4", "Total Capacity", "AI Health Score"]) {
      expect(body).not.toContain(fake);
    }
  });

  it("keeps the mobile navigation reachable, dismissable, and scroll-locking", async () => {
    await renderDashboard();
    const toggle = screen.getByRole("button", { name: "Open navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.body).toHaveClass("scroll-locked");
    expect(screen.getByRole("link", { name: /Back to landing page/ })).toHaveAttribute("href", landingPath());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
    expect(document.body).not.toHaveClass("scroll-locked");
  });

  it("names every backend control exactly, without folding option text into the label", async () => {
    await renderDashboard();
    expect(screen.getByRole("combobox", { name: "Backend" })).toHaveValue("auto");
    expect(screen.getByRole("textbox", { name: "Local endpoint" })).toHaveValue("http://127.0.0.1:8000");
    expect(screen.getByLabelText("Pairing token")).toBeInTheDocument();
  });

  it("links every dashboard section from the sidebar", async () => {
    await renderDashboard();
    for (const label of ["Overview", "Data Input", "Validation", "Prediction", "Suggestions", "System Status"]) {
      const link = screen.getByRole("link", { name: label });
      const id = link.getAttribute("href")?.slice(1) ?? "";
      expect(document.getElementById(id)).not.toBeNull();
    }
  });
});

describe("dashboard data workflow", () => {
  it("loads the supplied example, validates it, and charts only the supplied rows", async () => {
    await renderDashboard();
    expect(screen.getByText(/Charts appear once curve rows are supplied/)).toBeInTheDocument();

    await loadExample();
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() => expect(inputNotice()).toHaveTextContent("3,510 rows satisfy the canonical contract"));

    expect(screen.getByText("Contract satisfied")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Voltage against point index\. 3,510 supplied points/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Capacity coordinate against point index/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Temperature against point index/ })).toBeInTheDocument();
  });

  it("reports the real dataset contract rather than an invented quality score", async () => {
    await renderDashboard();
    await loadExample();
    const validation = document.getElementById("validation")!;
    expect(within(validation).getByText("3,510")).toBeInTheDocument();
    expect(within(validation).getByText("Cell1:cyc0000->cyc0100")).toBeInTheDocument();
    expect(within(validation).getByText("C1ch")).toBeInTheDocument();
    expect(within(validation).getByText("cyc0000")).toBeInTheDocument();
    expect(within(validation).getByText("cyc0100")).toBeInTheDocument();
    expect(within(validation).getByText("Yes")).toBeInTheDocument();
    expect(within(validation).getByText("Not validated yet")).toBeInTheDocument();
    expect(validation.textContent).not.toMatch(/quality score|grade|A\+/i);
  });

  it("surfaces validation errors from the existing rules", async () => {
    await renderDashboard();
    fireEvent.click(screen.getByRole("tab", { name: "Paste CSV" }));
    fireEvent.change(screen.getByLabelText("CSV text"), {
      target: { value: "sequence_id,cell_id,source_checkpoint,target_checkpoint,modality,point_index,time_s,voltage_V,capacity_Ah,temperature_K,actual_soh\ns,c,a,b,C1ch,0,0,99,0,298.15,\ns,c,a,b,C1ch,1,1,3.5,0,298.15," } });
    fireEvent.click(screen.getByRole("button", { name: "Parse pasted CSV" }));
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Row 1, voltage_V: expected volts between 0 and 10.");
    expect(screen.getByText("Problems found")).toBeInTheDocument();
  });

  it("exposes the canonical field contract in a collapsible help area", async () => {
    await renderDashboard();
    const help = screen.getByText("Canonical field contract").closest("details")!;
    for (const field of ["sequence_id", "cell_id", "source_checkpoint", "target_checkpoint", "modality", "point_index", "time_s", "voltage_V", "capacity_Ah", "temperature_K", "actual_soh"]) {
      expect(within(help).getByText(new RegExp(`^${field}`))).toBeInTheDocument();
    }
  });

  it("keeps the editable table available for supplied rows", async () => {
    await renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Add table row" }));
    const voltage = await screen.findByLabelText("Voltage row 1");
    fireEvent.change(voltage, { target: { value: "3.9" } });
    expect(screen.getByLabelText("Voltage row 1")).toHaveValue("3.9");
  });
});

describe("dashboard pairing and inference", () => {
  it("sends no inference request before explicit pairing", async () => {
    const fetchMock = await renderDashboard();
    await loadExample();
    fireEvent.change(screen.getByLabelText("Backend"), { target: { value: "local" } });
    fireEvent.click(screen.getByRole("button", { name: "Run prediction" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pair the local engine before sending battery data.");
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain(expect.stringContaining("/v1/infer"));
    for (const call of fetchMock.mock.calls) expect(String(call[0])).not.toContain("/v1/");
  });

  it("pairs against the loopback engine and keeps the token in sessionStorage only", async () => {
    await renderDashboard((url) => {
      if (url === "http://127.0.0.1:8000/v1/capabilities") return new Response(JSON.stringify({ ready: true, model_sha256: SHA, device: "cuda:0" }));
      if (url.endsWith("/v1/llm-capabilities")) return new Response(JSON.stringify({ provider: "ollama", model: "llama3.2:3b", reachable: false, model_installed: false, ready: false, endpoint: "", generation_available: false, reason: "Ollama is not running.", corrective_command: null, version: null }));
      return undefined;
    });
    await pair();
    expect(sessionStorage.getItem("batteryai-pairing-token")).toBe(TOKEN);
    expect(localStorage.length).toBe(0);
    expect(screen.getByLabelText("Pairing token")).toHaveAttribute("type", "password");
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("renders the real prediction, uncertainty, device, and abbreviated checkpoint hash", async () => {
    await renderDashboard((url, init) => {
      if (url === "http://127.0.0.1:8000/v1/capabilities") return new Response(JSON.stringify({ ready: true, model_sha256: SHA, device: "cuda:0" }));
      if (url.endsWith("/v1/llm-capabilities")) return new Response(JSON.stringify({ provider: "ollama", model: "llama3.2:3b", reachable: false, model_installed: false, ready: false, endpoint: "", generation_available: false, reason: "Ollama is not running.", corrective_command: null, version: null }));
      if (url === "http://127.0.0.1:8000/v1/infer") {
        expect(String((init as RequestInit).headers && (init as RequestInit & { headers: Record<string, string> }).headers["X-BatteryAI-Token"])).toBe(TOKEN);
        return new Response(JSON.stringify({ fallback_occurred: false, results: [prediction] }));
      }
      return undefined;
    });
    await loadExample();
    await pair();
    fireEvent.change(screen.getByLabelText("Backend"), { target: { value: "local" } });
    fireEvent.click(screen.getByRole("button", { name: "Run prediction" }));

    const overview = document.getElementById("overview")!;
    await waitFor(() => expect(within(overview).getByText("97.42")).toBeInTheDocument());
    expect(within(overview).getAllByText("1.83 pp").length).toBeGreaterThan(0);
    expect(within(overview).getAllByText("cuda:0").length).toBeGreaterThan(0);
    expect(within(overview).getByText("Oxford V1")).toBeInTheDocument();
    expect(within(overview).getByText("Cell1 · cyc0000 → cyc0100")).toBeInTheDocument();
    const predictionPanel = within(document.getElementById("prediction")!);
    expect(predictionPanel.getByText(`${SHA.slice(0, 12)}…`)).toBeInTheDocument();
    expect(predictionPanel.getByText(SHA)).toBeInTheDocument();
  });

  it("omits actual SOH and absolute error unless the response supplies them", async () => {
    const withActual: PredictionResult = { ...prediction, actual_soh: 96.1, absolute_error: 1.32 };
    let payload: PredictionResult = prediction;
    await renderDashboard((url) => {
      if (url === "http://127.0.0.1:8000/v1/capabilities") return new Response(JSON.stringify({ ready: true, model_sha256: SHA, device: "cuda:0" }));
      if (url.endsWith("/v1/llm-capabilities")) return new Response(JSON.stringify({ provider: "ollama", model: "llama3.2:3b", reachable: false, model_installed: false, ready: false, endpoint: "", generation_available: false, reason: "Ollama is not running.", corrective_command: null, version: null }));
      if (url === "http://127.0.0.1:8000/v1/infer") return new Response(JSON.stringify({ fallback_occurred: false, results: [payload] }));
      return undefined;
    });
    await loadExample();
    await pair();
    fireEvent.change(screen.getByLabelText("Backend"), { target: { value: "local" } });
    fireEvent.click(screen.getByRole("button", { name: "Run prediction" }));
    const overview = () => within(document.getElementById("overview")!);
    await waitFor(() => expect(overview().getByText("97.42")).toBeInTheDocument());
    expect(overview().queryByText("Actual SOH")).not.toBeInTheDocument();
    expect(overview().queryByText("Absolute error")).not.toBeInTheDocument();

    payload = withActual;
    fireEvent.click(screen.getByRole("button", { name: "Run prediction" }));
    await waitFor(() => expect(overview().getByText("Actual SOH")).toBeInTheDocument());
    expect(overview().getByText("96.10%")).toBeInTheDocument();
    expect(overview().getByText("1.32 pp")).toBeInTheDocument();
    expect(overview().getByText("Absolute error")).toBeInTheDocument();
  });

  it("reports a CUDA fallback only when the response says one happened", async () => {
    await renderDashboard((url) => {
      if (url === "http://127.0.0.1:8000/v1/capabilities") return new Response(JSON.stringify({ ready: true, model_sha256: SHA, device: "cuda:0" }));
      if (url.endsWith("/v1/llm-capabilities")) return new Response(JSON.stringify({ provider: "ollama", model: "llama3.2:3b", reachable: false, model_installed: false, ready: false, endpoint: "", generation_available: false, reason: "Ollama is not running.", corrective_command: null, version: null }));
      if (url === "http://127.0.0.1:8000/v1/infer") return new Response(JSON.stringify({ fallback_occurred: true, results: [{ ...prediction, runtime_device: "cpu", warnings: ["CUDA memory was exhausted; inference retried once on CPU."] }] }));
      return undefined;
    });
    await loadExample();
    await pair();
    fireEvent.change(screen.getByLabelText("Backend"), { target: { value: "local" } });
    fireEvent.click(screen.getByRole("button", { name: "Run prediction" }));
    expect(await screen.findByText(/the host fell back to CPU/)).toBeInTheDocument();
    expect(screen.getByText("CUDA memory was exhausted; inference retried once on CPU.")).toBeInTheDocument();
  });

  it("surfaces a failing engine through the existing error path", async () => {
    await renderDashboard((url) => {
      if (url === "http://127.0.0.1:8000/v1/capabilities") return new Response(JSON.stringify({ message: "Pairing token rejected." }), { status: 401 });
      return undefined;
    });
    fireEvent.change(screen.getByLabelText("Pairing token"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Test & pair host engine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pairing token rejected.");
    expect(screen.getAllByText("Unpaired").length).toBeGreaterThan(0);
  });
});

describe("dashboard system status", () => {
  it("reports real configuration without revealing the token or private paths", async () => {
    await renderDashboard();
    const status = document.getElementById("system-status")!;
    expect(within(status).getByText("Local (loopback)")).toBeInTheDocument();
    expect(within(status).getByText("Not paired")).toBeInTheDocument();
    expect(within(status).getByText("Unknown until paired")).toBeInTheDocument();
    expect(within(status).getByText("Oxford V1 (oxford-v1)")).toBeInTheDocument();
    expect(within(status).getByText("llama3.2:3b")).toBeInTheDocument();
    expect(within(status).getByText(/Loopback on the host computer only/)).toBeInTheDocument();
    expect(within(status).getByText("Unavailable for Oxford V1")).toBeInTheDocument();
    expect(within(status).getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(status.textContent).not.toMatch(/C:\\|\/home\/|model\.pt|\.mat/);
  });
});
