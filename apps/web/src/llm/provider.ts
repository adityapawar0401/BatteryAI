import { isConfiguredEndpoint } from "../config";
import type { PredictionResult } from "../types";
import { parseSuggestions, type Suggestions } from "./schema";

export const OLLAMA_MODEL = "llama3.2:3b";
export const OLLAMA_PULL_COMMAND = `ollama pull ${OLLAMA_MODEL}`;

export interface LocalLlmCapabilities {
  provider: "ollama";
  model: "llama3.2:3b";
  reachable: boolean;
  model_installed: boolean;
  ready: boolean;
  endpoint: string;
  generation_available: boolean;
  reason: string | null;
  corrective_command: string | null;
  version: string | null;
}

export interface SuggestionSummary {
  model_profile: string;
  model_sha256: string;
  predicted_soh: number;
  predictive_std: number;
  actual_soh: number | null;
  absolute_error: number | null;
  input_quality: string[];
  active_experts: string[];
  limitations: string[];
  backend: "local-pytorch" | "browser-onnx";
  runtime_device: string;
}

export interface LocalSuggestionResponse {
  provider: "ollama";
  model: "llama3.2:3b";
  suggestions: Suggestions;
  timing: { total_ms: number; ollama_total_ms: number | null; load_ms: number | null; prompt_eval_count: number | null; eval_count: number | null };
  done_reason: string | null;
}

export interface SuggestionProvider {
  capability(signal?: AbortSignal): Promise<LocalLlmCapabilities>;
  generate(result: PredictionResult, signal?: AbortSignal): Promise<LocalSuggestionResponse>;
}

export function buildSuggestionSummary(result: PredictionResult): SuggestionSummary {
  return {
    model_profile: result.model_profile,
    model_sha256: result.model_sha256,
    predicted_soh: result.predicted_soh,
    predictive_std: result.predictive_std,
    actual_soh: result.actual_soh,
    absolute_error: result.absolute_error,
    input_quality: result.warnings.slice(0, 10),
    active_experts: result.active_experts.slice(0, 10),
    limitations: ["next-observed-checkpoint horizon varies", "RUL unavailable", "not a safety certification"],
    backend: result.backend,
    runtime_device: result.runtime_device,
  };
}

export class LocalOllamaSuggestionProvider implements SuggestionProvider {
  constructor(private endpoint: string, private token: string, private configuredRemoteEndpoint: string | null = null) {}
  private headers(): HeadersInit { return { "Content-Type": "application/json", "X-BatteryAI-Token": this.token }; }

  async capability(signal?: AbortSignal): Promise<LocalLlmCapabilities> {
    if (!isConfiguredEndpoint(this.endpoint, this.configuredRemoteEndpoint)) return unavailable("BatteryAI endpoint is not the configured loopback or Funnel origin.");
    if (!this.token) return unavailable("Pair the BatteryAI local service before checking Local Ollama.");
    try {
      const response = await fetch(`${this.endpoint}/v1/llm-capabilities`, { headers: this.headers(), signal });
      const data = await response.json().catch(() => null);
      if (!response.ok) return unavailable(errorMessage(data, `Local LLM capability check failed with HTTP ${response.status}.`));
      return data as LocalLlmCapabilities;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return unavailable(error instanceof Error ? error.message : "BatteryAI local service is unavailable.");
    }
  }

  async generate(result: PredictionResult, signal?: AbortSignal): Promise<LocalSuggestionResponse> {
    if (!isConfiguredEndpoint(this.endpoint, this.configuredRemoteEndpoint)) throw new Error("BatteryAI endpoint is not the configured loopback or Funnel origin.");
    if (!this.token) throw new Error("Pair the BatteryAI local service before generating suggestions.");
    const response = await fetch(`${this.endpoint}/v1/suggestions`, { method: "POST", headers: this.headers(), body: JSON.stringify(buildSuggestionSummary(result)), signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorMessage(data, `Local suggestion generation failed with HTTP ${response.status}.`));
    if (data?.provider !== "ollama" || data?.model !== OLLAMA_MODEL) throw new Error("Local suggestion response reported an unexpected provider or model.");
    return { ...data, suggestions: parseSuggestions(data.suggestions) } as LocalSuggestionResponse;
  }
}

function unavailable(reason: string): LocalLlmCapabilities {
  return { provider: "ollama", model: OLLAMA_MODEL, reachable: false, model_installed: false, ready: false, endpoint: "", generation_available: false, reason, corrective_command: null, version: null };
}

function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : typeof (record.detail as Record<string, unknown> | undefined)?.message === "string" ? String((record.detail as Record<string, unknown>).message) : null;
    const corrective = (record.details as Record<string, unknown> | undefined)?.corrective_command;
    return `${message ?? fallback}${typeof corrective === "string" && !(message ?? "").includes(corrective) ? ` Run: ${corrective}` : ""}`;
  }
  return fallback;
}
