import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { FailureRiskPage } from "./FailureRiskPage";

const app = {
  schemaVersion: 1, title: "BatteryAI", modelProfile: "oxford-v1", inputMethods: ["upload", "paste", "table"],
  automaticFallback: true, localEndpoint: "http://127.0.0.1:8000", remoteEnabled: false, remoteApiUrl: null,
  suggestions: { enabled: true, rawRowsIncluded: false },
};

beforeEach(() => {
  sessionStorage.clear();
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
      return new Response(JSON.stringify({ task: "ev_failure", failure_probability: 0.0011102949501946568, failure_flag: false, decision_threshold: 0.3624247610569, model_version: "oxford_ev_failure_v1_full" }));
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  render(<FailureRiskPage />);
  await screen.findByRole("heading", { name: "Battery Failure Risk", level: 1 });
  fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "test-token" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await screen.findByRole("button", { name: "Connected" });
  fireEvent.click(screen.getByRole("button", { name: "Assess failure risk" }));
  await screen.findByText("0.1%");
  expect(screen.getByText("No failure flag")).toBeInTheDocument();
  expect(screen.getByText("36.2%")).toBeInTheDocument();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
});
