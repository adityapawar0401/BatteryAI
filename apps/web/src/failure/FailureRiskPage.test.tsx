import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FailureRiskPage } from "./FailureRiskPage";

const SHA = "a".repeat(64);
const EV_EXPERTS = ["core_operational", "usage_aging", "chemistry_geometry", "pack_context", "physics_state", "residual"];

const app = {
  schemaVersion: 1, title: "BatteryAI", modelProfile: "oxford-v1", inputMethods: ["upload", "paste", "table"],
  automaticFallback: true, localEndpoint: "http://127.0.0.1:8000", remoteEnabled: false, remoteApiUrl: null,
  suggestions: { enabled: true, rawRowsIncluded: false },
};

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("connects and renders the EV failure result without leakage fields", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("config/app.json")) return new Response(JSON.stringify(app));
    if (url.endsWith("/v1/capabilities")) return new Response(JSON.stringify({ tasks: { ev_failure: true }, model_version: "oxford_ev_failure_v1_full" }));
    if (url.endsWith("/api/predict/failure")) {
      const body = JSON.parse(String(init?.body));
      expect(body.snapshot.battery_failure).toBeUndefined();
      expect(body.snapshot.vehicle_brand).toBeUndefined();
      expect(body.snapshot.vehicle_age_years).toBeNull();
      return new Response(JSON.stringify({ task: "ev_failure", failure_probability: 0.0011102949501946568, failure_flag: false, decision_threshold: 0.3624247610569, model_version: "oxford_ev_failure_v1_full", model_sha256: SHA, active_experts: EV_EXPERTS }));
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  render(<FailureRiskPage />);
  await screen.findByRole("heading", { name: "Battery Failure Risk", level: 1 });
  fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "test-token" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await screen.findByText("Connected");
  fireEvent.click(screen.getByRole("button", { name: "Assess failure risk" }));
  await screen.findByText("0.1%");
  expect(screen.getByText("No failure flag")).toBeInTheDocument();
  expect(screen.getByText("36.2%")).toBeInTheDocument();
  expect(screen.getByText("Battery-PIMoE")).toBeInTheDocument();
  expect(screen.getByText(SHA.slice(0, 12))).toBeInTheDocument();
  expect(screen.queryByText("Diagnostic curve")).not.toBeInTheDocument();
  expect(document.querySelector("[data-analysis-shell='BatteryAI']")).not.toBeNull();
  expect(document.querySelector(".analysis-result-card .analysis-metric--primary")).not.toBeNull();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
});

test("uses the common analysis shell and consistent error treatment", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input).includes("config/app.json")) return new Response(JSON.stringify(app));
    return new Response(JSON.stringify({ detail: "rejected" }), { status: 401 });
  });

  render(<FailureRiskPage />);
  await screen.findByRole("heading", { name: "Battery Failure Risk", level: 1 });
  expect(document.querySelector(".analysis-page")).not.toBeNull();
  expect(document.querySelectorAll(".analysis-card").length).toBe(3);
  fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "bad-token" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  expect(await screen.findByRole("alert")).toHaveClass("analysis-error");
});
