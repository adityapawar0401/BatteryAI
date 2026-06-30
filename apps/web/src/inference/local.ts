import type { Capability, CurveRow, InferenceProvider, InferenceResponse } from "../types";
import { isConfiguredEndpoint } from "../config";

export class LocalHttpInferenceProvider implements InferenceProvider {
  readonly id = "local" as const;
  constructor(private endpoint: string, private token: string, private expectedModelSha256?: string, private configuredRemoteEndpoint: string | null = null) {}
  private headers(): HeadersInit { return { "Content-Type": "application/json", "X-BatteryAI-Token": this.token }; }
  async capability(signal?: AbortSignal): Promise<Capability> {
    if (!isConfiguredEndpoint(this.endpoint, this.configuredRemoteEndpoint)) return { available: false, reason: "BatteryAI endpoint is not the configured loopback or Funnel origin." };
    if (!this.token) return { available: false, reason: "Enter the pairing token printed by the local engine." };
    try {
      const response = await fetch(`${this.endpoint}/v1/capabilities`, { headers: this.headers(), signal });
      if (!response.ok) return { available: false, reason: response.status === 401 ? "Pairing token rejected." : `Local engine returned HTTP ${response.status}.` };
      const data = await response.json();
      if (this.expectedModelSha256 && data.model_sha256 !== this.expectedModelSha256) return { available: false, reason: "Local engine checkpoint does not match the configured Oxford V1 model." };
      return { available: data.ready === true, modelSha256: data.model_sha256, device: data.device };
    } catch (error) { return { available: false, reason: error instanceof Error ? error.message : "Local engine unavailable." }; }
  }
  async infer(rows: CurveRow[], signal?: AbortSignal): Promise<InferenceResponse> {
    if (!isConfiguredEndpoint(this.endpoint, this.configuredRemoteEndpoint)) throw new Error("BatteryAI endpoint is not the configured loopback or Funnel origin.");
    const response = await fetch(`${this.endpoint}/v1/infer`, { method: "POST", headers: this.headers(), body: JSON.stringify({ rows }), signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.detail?.message ?? data?.message ?? `Local inference failed with HTTP ${response.status}.`);
    const result = data as InferenceResponse;
    if (this.expectedModelSha256 && result.results.some((item) => item.model_sha256 !== this.expectedModelSha256)) throw new Error("Local inference response came from an unexpected checkpoint.");
    return result;
  }
}
