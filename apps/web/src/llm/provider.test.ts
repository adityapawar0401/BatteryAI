import { afterEach, describe, expect, it, vi } from "vitest";
import type { PredictionResult } from "../types";
import { LocalOllamaSuggestionProvider, OLLAMA_MODEL, buildSuggestionSummary } from "./provider";

afterEach(() => vi.restoreAllMocks());

const result = (soh: number): PredictionResult => ({
  request_id: `request-${soh}`, model_profile: "oxford-v1", model_sha256: "a".repeat(64), backend: "local-pytorch", runtime_device: "cuda",
  cell_id: "Cell1", sequence_id: `sequence-${soh}`, source_checkpoint: "cyc0000", target_checkpoint: "cyc0100",
  predicted_soh: soh, predictive_std: 2, actual_soh: null, absolute_error: null,
  active_experts: ["core_operational", "diagnostic_curve", "usage_aging", "residual"], warnings: ["fixture"], timing: { preprocessing_ms: 1, inference_ms: 2, total_ms: 3 },
});

describe("paired local Ollama suggestion provider", () => {
  it("checks capabilities only through the paired BatteryAI service", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ provider: "ollama", model: OLLAMA_MODEL, reachable: true, model_installed: true, ready: true, endpoint: "http://127.0.0.1:11434", generation_available: true, reason: null, corrective_command: null, version: "0.30.11" }), { status: 200 }));
    const capability = await new LocalOllamaSuggestionProvider("http://127.0.0.1:8000", "secret").capability();
    expect(capability.ready).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/v1/llm-capabilities");
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)["X-BatteryAI-Token"]).toBe("secret");
  });

  it("does not make a network request before pairing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const capability = await new LocalOllamaSuggestionProvider("http://127.0.0.1:8000", "").capability();
    expect(capability.ready).toBe(false); expect(capability.reason).toMatch(/Pair/); expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only the latest bounded summary and validates the response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ provider: "ollama", model: OLLAMA_MODEL, suggestions: { summary: "Review", actions: ["Inspect"], cautions: ["Uncertain"] }, timing: { total_ms: 12, ollama_total_ms: 10, load_ms: 0, prompt_eval_count: 20, eval_count: 10 }, done_reason: "stop" }), { status: 200 }));
    const latest = result(88);
    const response = await new LocalOllamaSuggestionProvider("http://localhost:8000", "secret").generate(latest);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/v1/suggestions");
    expect(request).toEqual(buildSuggestionSummary(latest));
    expect(request.predicted_soh).toBe(88); expect(request.rows).toBeUndefined(); expect(request.prompt).toBeUndefined();
    expect(response.suggestions.summary).toBe("Review");
  });

  it("rejects unexpected provider identity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ provider: "cloud", model: OLLAMA_MODEL, suggestions: {} }), { status: 200 }));
    await expect(new LocalOllamaSuggestionProvider("http://127.0.0.1:8000", "secret").generate(result(90))).rejects.toThrow(/unexpected provider/);
  });

  it("rejects successful-looking responses with empty actions or cautions", async () => {
    for (const suggestions of [
      { summary: "Review", actions: [], cautions: ["Uncertain"] },
      { summary: "Review", actions: ["Inspect"], cautions: [] },
    ]) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ provider: "ollama", model: OLLAMA_MODEL, suggestions, timing: { total_ms: 1 }, done_reason: "stop" }), { status: 200 }));
      await expect(new LocalOllamaSuggestionProvider("http://127.0.0.1:8000", "secret").generate(result(90))).rejects.toThrow(/safe display schema/);
    }
  });

  it("surfaces the structured incomplete-suggestions backend error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: { code: "incomplete_suggestions", message: "The local LLM returned incomplete structured suggestions." } }), { status: 502 }));
    await expect(new LocalOllamaSuggestionProvider("http://127.0.0.1:8000", "secret").generate(result(90))).rejects.toThrow("The local LLM returned incomplete structured suggestions.");
  });

  it("applies the identical response contract through the configured remote origin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ provider: "ollama", model: OLLAMA_MODEL, suggestions: { summary: "Review", actions: ["Inspect"], cautions: ["Uncertain"] }, timing: { total_ms: 1, ollama_total_ms: 1, load_ms: 0, prompt_eval_count: 1, eval_count: 1 }, done_reason: "stop" }), { status: 200 }));
    const response = await new LocalOllamaSuggestionProvider("https://battery.example.ts.net", "secret", "https://battery.example.ts.net").generate(result(90));
    expect(fetchMock.mock.calls[0][0]).toBe("https://battery.example.ts.net/v1/suggestions");
    expect(response.suggestions.actions).toEqual(["Inspect"]);
  });
});
