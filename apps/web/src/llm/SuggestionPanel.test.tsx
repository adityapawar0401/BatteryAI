import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PredictionResult } from "../types";
import { OLLAMA_MODEL, OLLAMA_PULL_COMMAND, type LocalLlmCapabilities, type LocalSuggestionResponse, type SuggestionProvider } from "./provider";
import { SuggestionPanel } from "./SuggestionPanel";

afterEach(cleanup);

const prediction = (soh: number): PredictionResult => ({
  request_id: `request-${soh}`, model_profile: "oxford-v1", model_sha256: "a".repeat(64), backend: "local-pytorch", runtime_device: "cuda",
  cell_id: "Cell1", sequence_id: `sequence-${soh}`, source_checkpoint: "cyc0000", target_checkpoint: "cyc0100",
  predicted_soh: soh, predictive_std: 2, actual_soh: null, absolute_error: null,
  active_experts: ["core_operational", "diagnostic_curve", "usage_aging", "residual"], warnings: [], timing: { preprocessing_ms: 1, inference_ms: 2, total_ms: 3 },
});

const ready: LocalLlmCapabilities = { provider: "ollama", model: OLLAMA_MODEL, reachable: true, model_installed: true, ready: true, endpoint: "http://127.0.0.1:11434", generation_available: true, reason: null, corrective_command: null, version: "0.30.11" };
const completed: LocalSuggestionResponse = { provider: "ollama", model: OLLAMA_MODEL, suggestions: { summary: "Review complete", usage_guidance: "monitor_more_closely", actions: ["Inspect", "Monitor"], cautions: ["Decision support only"] }, timing: { total_ms: 12, ollama_total_ms: 10, load_ms: 0, prompt_eval_count: 20, eval_count: 10 }, done_reason: "stop" };

class FakeProvider implements SuggestionProvider {
  capability = vi.fn(async () => ready);
  generate = vi.fn(async () => completed);
}

describe("AI insights interaction", () => {
  it("enables generation only for a connected service, ready insights, and a completed analysis", async () => {
    const provider = new FakeProvider();
    render(<SuggestionPanel paired latestResult={prediction(97)} provider={provider} />);
    expect(await screen.findByRole("button", { name: "Generate insights" })).toBeEnabled();
    expect(provider.capability).toHaveBeenCalled();
  });

  it("names no provider, model, or internal component anywhere in the panel", async () => {
    const provider = new FakeProvider();
    const { container } = render(<SuggestionPanel paired latestResult={prediction(97)} provider={provider} />);
    await screen.findByRole("button", { name: "Generate insights" });
    const text = (container.textContent ?? "").toLowerCase();
    for (const term of ["ollama", "llama3.2", "provider", "local llm", "loopback", "checkpoint", "oxford", "pimoe"]) {
      expect(text).not.toContain(term);
    }
  });

  it("reports an unavailable service without exposing the corrective command", async () => {
    const provider = new FakeProvider();
    provider.capability.mockResolvedValue({ ...ready, model_installed: false, ready: false, generation_available: false, reason: "Configured model is not installed.", corrective_command: OLLAMA_PULL_COMMAND });
    render(<SuggestionPanel paired latestResult={prediction(97)} provider={provider} />);
    expect(await screen.findByText(/Insights: Unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(OLLAMA_PULL_COMMAND)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate insights" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/AI insights are temporarily unavailable\./).length).toBeGreaterThan(0);
  });

  it("uses the latest analysis, exposes generating and completed states, and preserves the number", async () => {
    let resolveGeneration!: (value: LocalSuggestionResponse) => void;
    const provider = new FakeProvider();
    provider.generate = vi.fn(() => new Promise<LocalSuggestionResponse>((resolve) => { resolveGeneration = resolve; }));
    const view = render(<><output aria-label="numerical prediction">97.00</output><SuggestionPanel paired latestResult={prediction(97)} provider={provider} /></>);
    await screen.findByRole("button", { name: "Generate insights" });
    view.rerender(<><output aria-label="numerical prediction">88.00</output><SuggestionPanel paired latestResult={prediction(88)} provider={provider} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Generate insights" }));
    expect(screen.getByText(/Insights: Generating/)).toBeInTheDocument();
    expect(screen.getByLabelText("numerical prediction")).toHaveTextContent("88.00");
    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ predicted_soh: 88 }), expect.any(AbortSignal));
    await act(async () => resolveGeneration(completed));
    expect(await screen.findByText("Review complete")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Usage Guidance" })).toBeInTheDocument();
    expect(screen.getByText("Monitor More Closely")).toBeInTheDocument();
    expect(screen.queryByText("monitor_more_closely")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByText(/Insights: Completed/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recommended actions" })).toBeInTheDocument();
    expect(screen.getByText("Inspect", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByText("Monitor", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Considerations" })).toBeInTheDocument();
    expect(screen.getByText("Decision support only", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByLabelText("numerical prediction")).toHaveTextContent("88.00");
  });

  it("shows a customer-facing generation error and supports cancellation", async () => {
    const provider = new FakeProvider();
    provider.generate.mockRejectedValueOnce(new Error("Ollama out of memory"));
    render(<SuggestionPanel paired latestResult={prediction(97)} provider={provider} />);
    await screen.findByRole("button", { name: "Generate insights" });
    fireEvent.click(screen.getByRole("button", { name: "Generate insights" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("AI insights are temporarily unavailable.");
    expect(alert.textContent?.toLowerCase()).not.toContain("ollama");

    provider.generate = vi.fn((_result: PredictionResult, signal?: AbortSignal) => new Promise<LocalSuggestionResponse>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
    fireEvent.click(screen.getByRole("button", { name: "Generate insights" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByText(/cancelled/)).toBeInTheDocument());
  });

  it("does not complete or render empty headings for incomplete responses and remains retryable", async () => {
    const provider = new FakeProvider();
    provider.generate
      .mockResolvedValueOnce({ ...completed, suggestions: { summary: "Incomplete", usage_guidance: "normal_use", actions: [], cautions: ["Uncertain"] } })
      .mockResolvedValueOnce(completed);
    render(<><output aria-label="numerical prediction">97.00</output><SuggestionPanel paired latestResult={prediction(97)} provider={provider} /></>);
    fireEvent.click(await screen.findByRole("button", { name: "Generate insights" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI insights are temporarily unavailable.");
    expect(screen.queryByRole("heading", { name: "Recommended actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Considerations" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("numerical prediction")).toHaveTextContent("97.00");
    fireEvent.click(screen.getByRole("button", { name: "Generate insights" }));
    expect(await screen.findByText("Review complete")).toBeInTheDocument();
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("numerical prediction")).toHaveTextContent("97.00");
  });

  it("keeps Generate usable after a structured incomplete-output failure", async () => {
    const provider = new FakeProvider();
    provider.generate.mockRejectedValue(new Error("The local LLM returned incomplete structured suggestions."));
    render(<SuggestionPanel paired latestResult={prediction(97)} provider={provider} />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate insights" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("AI insights are temporarily unavailable.");
    expect(alert.textContent?.toLowerCase()).not.toContain("llm");
    expect(screen.getByRole("button", { name: "Generate insights" })).toBeEnabled();
  });

  it("normalizes em dashes in generated insight text before display", async () => {
    const provider = new FakeProvider();
    provider.generate.mockResolvedValue({
      ...completed,
      suggestions: {
        ...completed.suggestions,
        summary: "Normal use is reasonable — continue monitoring.",
        actions: ["Monitor health — compare later.", "Arrange a future measurement."],
      },
    });
    const { container } = render(<SuggestionPanel paired latestResult={prediction(97)} provider={provider} />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate insights" }));
    await screen.findByText("Normal use is reasonable, continue monitoring.");
    expect(container.textContent).not.toContain("—");
  });
});
