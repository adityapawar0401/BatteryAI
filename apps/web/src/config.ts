import type { ModelProfile } from "./types";

export interface AppConfig { title: string; localEndpoint: string; modelProfile: string; inputMethods: string[]; automaticFallback: boolean; llm: { provider: string; model: string; temperature: number; maxTokens: number }; suggestions: { enabled: boolean; rawRowsIncluded: boolean } }

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  if (Object.keys(value).sort().join("|") !== [...expected].sort().join("|")) throw new Error(`${label} contains missing or unknown fields.`);
}

export function validateAppConfig(value: unknown): AppConfig {
  if (!value || typeof value !== "object") throw new Error("App configuration must be an object.");
  const app = value as Record<string, unknown>;
  exactKeys(app, ["schemaVersion", "title", "modelProfile", "inputMethods", "automaticFallback", "localEndpoint", "llm", "suggestions"], "App configuration");
  if (app.schemaVersion !== 1 || app.title !== "BatteryAI" || typeof app.modelProfile !== "string" || !Array.isArray(app.inputMethods) || typeof app.automaticFallback !== "boolean") throw new Error("App configuration has invalid core fields.");
  if (typeof app.localEndpoint !== "string" || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(app.localEndpoint)) throw new Error("Local endpoint must be loopback HTTP.");
  const llm = app.llm as Record<string, unknown>; exactKeys(llm, ["provider", "model", "temperature", "maxTokens"], "LLM configuration");
  if (llm.provider !== "webllm" || typeof llm.model !== "string" || typeof llm.temperature !== "number" || typeof llm.maxTokens !== "number") throw new Error("LLM configuration is invalid.");
  const suggestions = app.suggestions as Record<string, unknown>; exactKeys(suggestions, ["enabled", "rawRowsIncluded"], "Suggestion configuration");
  if (typeof suggestions.enabled !== "boolean" || suggestions.rawRowsIncluded !== false) throw new Error("Suggestion configuration is invalid.");
  return value as AppConfig;
}

export function validateModelProfile(value: unknown): ModelProfile {
  if (!value || typeof value !== "object") throw new Error("Model profile must be an object.");
  const profile = value as ModelProfile;
  if (profile.schemaVersion !== 1 || !profile.id || !/^[a-f0-9]{64}$/.test(profile.modelSha256) || profile.activeExperts?.join("|") !== "core_operational|diagnostic_curve|usage_aging|residual" || !Array.isArray(profile.maskedExperts) || !profile.browserModel || !profile.localModel) throw new Error("Model profile validation failed.");
  return profile;
}
