import { describe, expect, it, vi } from "vitest";
import { AutoInferenceProvider } from "./auto";
import type { InferenceProvider } from "../types";

describe("automatic inference safety", () => {
  it("does not turn cancellation into a local data transfer", async () => {
    const controller = new AbortController(); controller.abort();
    const browser = { id: "browser", capability: vi.fn().mockResolvedValue({ available: true }), infer: vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")) } as InferenceProvider;
    const local = { id: "local", capability: vi.fn(), infer: vi.fn() } as unknown as InferenceProvider;
    await expect(new AutoInferenceProvider(browser, local, true).infer([], controller.signal)).rejects.toThrow(/Aborted/);
    expect(local.infer).not.toHaveBeenCalled();
  });
});
