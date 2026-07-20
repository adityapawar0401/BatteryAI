import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); });

const FUNNEL = "https://battery.example.ts.net";

describe("remote production shell", () => {
  it("uses the configured origin without revealing it and makes no backend request before connecting", async () => {
    const app = { schemaVersion: 1, title: "BatteryAI", modelProfile: "oxford-v1", inputMethods: ["upload", "paste", "table"], automaticFallback: true, localEndpoint: "http://127.0.0.1:8000", remoteEnabled: true, remoteApiUrl: FUNNEL, suggestions: { enabled: true, rawRowsIncluded: false } };
    const profile = await import("../../public/config/oxford-v1.json");
    const schema = await import("../../public/config/oxford-input-schema.json");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("app.json")) return new Response(JSON.stringify(app));
      if (url.includes("oxford-v1.json")) return new Response(JSON.stringify(profile.default));
      if (url.includes("oxford-input-schema.json")) return new Response(JSON.stringify(schema.default));
      throw new Error(`Unexpected pre-connection request: ${url}`);
    });

    render(<DashboardPage />);
    await screen.findByRole("heading", { name: "Battery health analysis" });

    // Only the three static configuration files are fetched before the user connects.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    for (const call of fetchMock.mock.calls) expect(String(call[0])).not.toContain("/v1/");

    // The service address is used internally but never shown or editable.
    const text = document.body.textContent ?? "";
    expect(text).not.toContain(FUNNEL);
    expect(text).not.toContain("ts.net");
    expect(text).not.toContain("https://");
    expect(screen.queryByDisplayValue(FUNNEL)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/funnel|endpoint|backend|service url/i)).not.toBeInTheDocument();
    expect(text.toLowerCase()).not.toContain("remote");
  });

  it("sends the access code to the configured origin and nowhere else", async () => {
    const app = { schemaVersion: 1, title: "BatteryAI", modelProfile: "oxford-v1", inputMethods: ["upload", "paste", "table"], automaticFallback: true, localEndpoint: "http://127.0.0.1:8000", remoteEnabled: true, remoteApiUrl: FUNNEL, suggestions: { enabled: true, rawRowsIncluded: false } };
    const profile = await import("../../public/config/oxford-v1.json");
    const schema = await import("../../public/config/oxford-input-schema.json");
    const requested: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("app.json")) return new Response(JSON.stringify(app));
      if (url.includes("oxford-v1.json")) return new Response(JSON.stringify(profile.default));
      if (url.includes("oxford-input-schema.json")) return new Response(JSON.stringify(schema.default));
      requested.push(url);
      if (url === `${FUNNEL}/v1/capabilities`) {
        expect((init?.headers as Record<string, string>)["X-BatteryAI-Token"]).toBe("code-123");
        return new Response(JSON.stringify({ ready: true, model_sha256: profile.default.modelSha256, device: "cuda:0" }));
      }
      return new Response(JSON.stringify({ provider: "ollama", model: "llama3.2:3b", reachable: false, model_installed: false, ready: false, endpoint: "", generation_available: false, reason: "unavailable", corrective_command: null, version: null }));
    });

    render(<DashboardPage />);
    await screen.findByRole("heading", { name: "Battery health analysis" });
    fireEvent.change(screen.getByLabelText("Access code"), { target: { value: "code-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => expect(screen.getAllByText("Connected").length).toBeGreaterThan(0));
    expect(requested[0]).toBe(`${FUNNEL}/v1/capabilities`);
    for (const url of requested) expect(url.startsWith(FUNNEL)).toBe(true);
    expect(sessionStorage.getItem("batteryai-pairing-token")).toBe("code-123");
    expect(document.body.textContent).not.toContain("code-123");
  });
});
