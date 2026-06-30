import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalHttpInferenceProvider } from "./local";

afterEach(() => vi.restoreAllMocks());
describe("local pairing", () => {
  it("does not connect without a token", async () => expect((await new LocalHttpInferenceProvider("http://127.0.0.1:8000", "").capability()).available).toBe(false));
  it("sends token only in the custom header", async () => {
    const hash = "a".repeat(64);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ready: true, device: "cpu", model_sha256: hash }), { status: 200 }));
    expect((await new LocalHttpInferenceProvider("http://127.0.0.1:8000", "secret", hash).capability()).available).toBe(true);
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)["X-BatteryAI-Token"]).toBe("secret");
  });
  it("never contacts non-loopback endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await new LocalHttpInferenceProvider("https://example.com", "secret").capability()).available).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects an engine with the wrong finalized checkpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ready: true, device: "cpu", model_sha256: "b".repeat(64) }), { status: 200 }));
    const capability = await new LocalHttpInferenceProvider("http://127.0.0.1:8000", "secret", "a".repeat(64)).capability();
    expect(capability.available).toBe(false); expect(capability.reason).toMatch(/checkpoint/);
  });
});
