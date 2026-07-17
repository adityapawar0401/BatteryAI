import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); });

describe("remote production shell", () => {
  it("locks the configured Funnel origin and makes no backend request before pairing", async () => {
    const app = { schemaVersion: 1, title: "BatteryAI", modelProfile: "oxford-v1", inputMethods: ["upload", "paste", "table"], automaticFallback: true, localEndpoint: "http://127.0.0.1:8000", remoteEnabled: true, remoteApiUrl: "https://battery.example.ts.net", suggestions: { enabled: true, rawRowsIncluded: false } };
    const profile = await import("../../public/config/oxford-v1.json");
    const schema = await import("../../public/config/oxford-input-schema.json");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("app.json")) return new Response(JSON.stringify(app));
      if (url.includes("oxford-v1.json")) return new Response(JSON.stringify(profile.default));
      if (url.includes("oxford-input-schema.json")) return new Response(JSON.stringify(schema.default));
      throw new Error(`Unexpected pre-pair request: ${url}`);
    });
    render(<DashboardPage />);
    const endpoint = await screen.findByLabelText("Configured Funnel backend");
    expect(endpoint).toHaveValue("https://battery.example.ts.net");
    expect(endpoint).toHaveAttribute("readonly");
    expect(screen.getByText(/host computer, which must remain online/i)).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});
