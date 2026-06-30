import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalHttpInferenceProvider } from "./local";

afterEach(() => vi.restoreAllMocks());
describe("local pairing", () => {
  it("does not connect without a token", async () => expect((await new LocalHttpInferenceProvider("http://127.0.0.1:8000", "").capability()).available).toBe(false));
  it("sends token only in the custom header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ready: true, device: "cpu" }), { status: 200 }));
    expect((await new LocalHttpInferenceProvider("http://127.0.0.1:8000", "secret").capability()).available).toBe(true);
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)["X-BatteryAI-Token"]).toBe("secret");
  });
});
