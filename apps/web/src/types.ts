export type BackendMode = "auto" | "browser" | "local";

export interface CurveRow {
  sequence_id: string;
  cell_id: string;
  source_checkpoint: string;
  target_checkpoint: string;
  modality: "C1ch" | "C1dc" | "OCVch" | "OCVdc";
  point_index: number;
  time_s: number;
  voltage_V: number;
  capacity_Ah: number;
  temperature_K: number;
  actual_soh?: number | null;
}

export interface Timing { preprocessing_ms: number; inference_ms: number; total_ms: number }
export interface PredictionResult {
  request_id: string; model_profile: string; model_sha256: string; backend: "local-pytorch" | "browser-onnx";
  runtime_device: string; cell_id: string; sequence_id: string; source_checkpoint: string; target_checkpoint: string;
  predicted_soh: number; predictive_std: number; actual_soh: number | null; absolute_error: number | null;
  active_experts: string[]; warnings: string[]; timing: Timing;
}
export interface InferenceResponse { results: PredictionResult[]; fallback_occurred: boolean }

export interface ModelProfile {
  schemaVersion: 1; id: string; title: string; target: string; modelSha256: string; activeExperts: string[]; maskedExperts: string[];
  browserModel: { available: boolean; path: string | null; executionProviders: string[]; reason: string; inputNames?: string[]; outputNames?: string[] };
  preprocessing?: { featureMean: number[]; featureStd: number[]; diagnosticMean: Record<string, number>; diagnosticStd: Record<string, number>; targetMean: number; targetStd: number };
  localModel: { available: boolean; defaultEndpoint: string }; limitations: string[];
}

export interface Capability { available: boolean; reason?: string; modelSha256?: string; device?: string }

export interface InferenceProvider {
  readonly id: "browser" | "local";
  capability(signal?: AbortSignal): Promise<Capability>;
  infer(rows: CurveRow[], signal?: AbortSignal): Promise<InferenceResponse>;
}
