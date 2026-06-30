import type { Capability, CurveRow, InferenceProvider, InferenceResponse } from "../types";

export class LocalHttpInferenceProvider implements InferenceProvider {
  readonly id = "local" as const;
  constructor(private endpoint: string, private token: string) {}
  private headers(): HeadersInit { return { "Content-Type": "application/json", "X-BatteryAI-Token": this.token }; }
  async capability(signal?: AbortSignal): Promise<Capability> {
    if (!this.token) return { available: false, reason: "Enter the pairing token printed by the local engine." };
    try {
      const response = await fetch(`${this.endpoint}/v1/capabilities`, { headers: this.headers(), signal });
      if (!response.ok) return { available: false, reason: response.status === 401 ? "Pairing token rejected." : `Local engine returned HTTP ${response.status}.` };
      const data = await response.json();
      return { available: data.ready === true, modelSha256: data.model_sha256, device: data.device };
    } catch (error) { return { available: false, reason: error instanceof Error ? error.message : "Local engine unavailable." }; }
  }
  async infer(rows: CurveRow[], signal?: AbortSignal): Promise<InferenceResponse> {
    const response = await fetch(`${this.endpoint}/v1/infer`, { method: "POST", headers: this.headers(), body: JSON.stringify({ rows }), signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.detail?.message ?? data?.message ?? `Local inference failed with HTTP ${response.status}.`);
    return data as InferenceResponse;
  }
}
