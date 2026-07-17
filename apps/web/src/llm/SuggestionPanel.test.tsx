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
const completed: LocalSuggestionResponse = { provider: "ollama", model: OLLAMA_MODEL, suggestions: { summary: "Review complete", actions: ["Inspect"], cautions: ["Decision support only"] }, timing: { total_ms: 12, ollama_total_ms: 10, load_ms: 0, prompt_eval_count: 20, eval_count: 10 }, done_reason: "stop" };

class FakeProvider implements SuggestionProvider {
  capability = vi.fn(async () => ready);
  generate = vi.fn(async () => completed);
}

describe("Local Ollama suggestion interaction", () => {
  it("enables generation only for paired service, ready Ollama, and a completed prediction", async () => {
    const provider = new FakeProvider();
    render(<SuggestionPanel paired latestResult={prediction(97)} provider={provider} />);
    expect(await screen.findByRole("button", { name: "Generate suggestions" })).toBeEnabled();
    expect(screen.getByText(/Provider:/)).toHaveTextContent("Local Ollama");
    expect(screen.getByText(/Model:/)).toHaveTextContent(OLLAMA_MODEL);
    expect(screen.queryByRole("button", { name: /Load browser LLM/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/WebGPU/)).not.toBeInTheDocument();
  });

  it("shows unavailable and missing-model reasons without enabling generation", async () => {
    const provider = new FakeProvider();
    provider.capability.mockResolvedValue({ ...ready, model_installed: false, ready: false, generation_available: false, reason: "Configured model is not installed.", corrective_command: OLLAMA_PULL_COMMAND });
    render(<SuggestionPanel paired latestResult={prediction(97)} provider={provider} />);
    expect(await screen.findByText(OLLAMA_PULL_COMMAND)).toBeInTheDocument();
    expect(screen.getByText(/Local LLM: unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate suggestions" })).not.toBeInTheDocument();
  });

  it("uses the latest prediction, exposes generating/completed states, and preserves the number", async () => {
    let resolveGeneration!: (value: LocalSuggestionResponse) => void;
    const provider = new FakeProvider();
    provider.generate = vi.fn(() => new Promise<LocalSuggestionResponse>((resolve) => { resolveGeneration = resolve; }));
    const view = render(<><output aria-label="numerical prediction">97.00</output><SuggestionPanel paired latestResult={prediction(97)} provider={provider} /></>);
    await screen.findByRole("button", { name: "Generate suggestions" });
    view.rerender(<><output aria-label="numerical prediction">88.00</output><SuggestionPanel paired latestResult={prediction(88)} provider={provider} /></>);
    fireEvent.click(screen.getByRole("button", { name: "Generate suggestions" }));
    expect(screen.getByText(/Local LLM: generating/)).toBeInTheDocument(); expect(screen.getByLabelText("numerical prediction")).toHaveTextContent("88.00");
    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ predicted_soh: 88 }), expect.any(AbortSignal));
    await act(async () => resolveGeneration(completed));
    expect(await screen.findByText("Review complete")).toBeInTheDocument(); expect(screen.getByText(/Local LLM: completed/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Actions" })).toBeInTheDocument();
    expect(screen.getByText("Inspect", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cautions" })).toBeInTheDocument();
    expect(screen.getByText("Decision support only", { selector: "li" })).toBeInTheDocument();
  });

  it("shows generation errors and supports cancellation", async () => {
    const provider = new FakeProvider(); provider.generate.mockRejectedValueOnce(new Error("Ollama out of memory"));
    render(<SuggestionPanel paired latestResult={prediction(97)} provider={provider} />);
    await screen.findByRole("button", { name: "Generate suggestions" }); fireEvent.click(screen.getByRole("button", { name: "Generate suggestions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ollama out of memory");

    provider.generate = vi.fn((_result: PredictionResult, signal?: AbortSignal) => new Promise<LocalSuggestionResponse>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
    fireEvent.click(screen.getByRole("button", { name: "Generate suggestions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByText(/cancelled/)).toBeInTheDocument());
  });

  it("does not complete or render empty headings for incomplete responses and remains retryable", async () => {
    const provider = new FakeProvider();
    provider.generate
      .mockResolvedValueOnce({ ...completed, suggestions: { summary: "Incomplete", actions: [], cautions: ["Uncertain"] } })
      .mockResolvedValueOnce(completed);
    render(<><output aria-label="numerical prediction">97.00</output><SuggestionPanel paired latestResult={prediction(97)} provider={provider} /></>);
    fireEvent.click(await screen.findByRole("button", { name: "Generate suggestions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/safe display schema/);
    expect(screen.queryByRole("heading", { name: "Actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cautions" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("numerical prediction")).toHaveTextContent("97.00");
    fireEvent.click(screen.getByRole("button", { name: "Generate suggestions" }));
    expect(await screen.findByText("Review complete")).toBeInTheDocument();
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("numerical prediction")).toHaveTextContent("97.00");
  });

  it("shows the structured incomplete-suggestions error and keeps Generate usable", async () => {
    const provider = new FakeProvider();
    provider.generate.mockRejectedValue(new Error("The local LLM returned incomplete structured suggestions."));
    render(<SuggestionPanel paired latestResult={prediction(97)} provider={provider} />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate suggestions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The local LLM returned incomplete structured suggestions.");
    expect(screen.getByRole("button", { name: "Generate suggestions" })).toBeEnabled();
  });
});
