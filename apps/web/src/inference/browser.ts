import type { Capability, CurveRow, InferenceProvider, InferenceResponse, ModelProfile } from "../types";

const diagnosticNames = ["time_s", "voltage_V", "capacity_Ah", "temperature_K", "ica_dQ_dV", "dva_dV_dQ"];

export class BrowserOnnxInferenceProvider implements InferenceProvider {
  readonly id = "browser" as const;
  constructor(private profile: ModelProfile) {}
  async capability(): Promise<Capability> {
    if (!this.profile.browserModel.available || !this.profile.browserModel.path) return { available: false, reason: this.profile.browserModel.reason };
    if (typeof WebAssembly === "undefined") return { available: false, reason: "WebAssembly is unavailable." };
    return { available: true, modelSha256: this.profile.modelSha256, device: "browser" };
  }
  async infer(_rows: CurveRow[], _signal?: AbortSignal): Promise<InferenceResponse> {
    const capability = await this.capability();
    if (!capability.available) throw new Error(capability.reason);
    if (!this.profile.preprocessing || !this.profile.browserModel.path) throw new Error("Verified browser preprocessing metadata is missing.");
    _signal?.throwIfAborted();
    const started = performance.now();
    const groups = new Map<string, CurveRow[]>();
    _rows.forEach((row) => groups.set(row.sequence_id, [...(groups.get(row.sequence_id) ?? []), row]));
    const ordered = [...groups.values()].map((rows) => [...rows].sort((a, b) => a.point_index - b.point_index));
    const batch = ordered.length; const sequence = Math.max(...ordered.map((rows) => rows.length)); const preprocessing = this.profile.preprocessing;
    const core = new Float32Array(batch * sequence * 4); const diagnostic = new Float32Array(batch * sequence * 6);
    const valid = new Uint8Array(batch * sequence); const diagnosticValid = new Uint8Array(batch * sequence * 6);
    ordered.forEach((rows, b) => rows.forEach((row, s) => {
      const rawCore = [row.time_s, row.voltage_V, 0, row.temperature_K];
      rawCore.forEach((value, channel) => { core[(b * sequence + s) * 4 + channel] = (value - preprocessing.featureMean[channel]) / preprocessing.featureStd[channel]; });
      const previous = rows[s - 1]; const dv = previous ? row.voltage_V - previous.voltage_V : 0; const dq = previous ? row.capacity_Ah - previous.capacity_Ah : 0;
      const derived = [row.time_s, row.voltage_V, row.capacity_Ah, row.temperature_K, dv !== 0 ? dq / dv : 0, dq !== 0 ? dv / dq : 0];
      derived.forEach((value, channel) => {
        const derivativeValid = channel < 4 || (s > 0 && Number.isFinite(value) && (channel === 4 ? dv !== 0 : dq !== 0));
        const offset = (b * sequence + s) * 6 + channel; diagnosticValid[offset] = derivativeValid ? 1 : 0;
        diagnostic[offset] = derivativeValid ? (value - preprocessing.diagnosticMean[diagnosticNames[channel]]) / preprocessing.diagnosticStd[diagnosticNames[channel]] : 0;
      });
      valid[b * sequence + s] = 1;
    }));
    const preprocessed = performance.now();
    const ort = await import("onnxruntime-web");
    const providers = "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
    const session = await ort.InferenceSession.create(`${import.meta.env.BASE_URL}${this.profile.browserModel.path}`, { executionProviders: providers });
    try {
      const outputs = await session.run({ core: new ort.Tensor("float32", core, [batch, sequence, 4]), diagnostic: new ort.Tensor("float32", diagnostic, [batch, sequence, 6]), valid: new ort.Tensor("bool", valid, [batch, sequence]), diagnostic_valid: new ort.Tensor("bool", diagnosticValid, [batch, sequence, 6]) });
      _signal?.throwIfAborted();
      const locations = outputs.soh_location_scaled.data as Float32Array; const scales = outputs.soh_scale_scaled.data as Float32Array; const finished = performance.now(); const requestId = crypto.randomUUID();
      return { fallback_occurred: false, results: ordered.map((rows, index) => {
        const predicted = locations[index] * preprocessing.targetStd + preprocessing.targetMean; const std = scales[index] * Math.abs(preprocessing.targetStd); const actual = rows.find((row) => row.actual_soh != null)?.actual_soh ?? null;
        return { request_id: requestId, model_profile: this.profile.id, model_sha256: this.profile.modelSha256, backend: "browser-onnx", runtime_device: providers[0], cell_id: rows[0].cell_id, sequence_id: rows[0].sequence_id, source_checkpoint: rows[0].source_checkpoint, target_checkpoint: rows[0].target_checkpoint, predicted_soh: predicted, predictive_std: std, actual_soh: actual, absolute_error: actual == null ? null : Math.abs(predicted - actual), active_experts: this.profile.activeExperts, warnings: [], timing: { preprocessing_ms: preprocessed - started, inference_ms: finished - preprocessed, total_ms: finished - started } };
      }) };
    } finally { await session.release(); }
  }
}
