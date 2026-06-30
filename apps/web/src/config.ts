import type { ModelProfile } from "./types";

const activeExperts = ["core_operational", "diagnostic_curve", "usage_aging", "residual"];
const maskedExperts = ["eis_complex", "relaxation_pulse", "thermal_mechanical", "chemistry_geometry", "pack_context", "physics_state"];

export function isLoopbackEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost") && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}

export function validateRemoteApiUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net$/.test(url.hostname) || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) throw new Error("Remote API URL must be an exact HTTPS ts.net origin.");
  return `https://${url.hostname.toLowerCase()}`;
}

export function isConfiguredEndpoint(value: string, remoteApiUrl: string | null = null): boolean {
  if (isLoopbackEndpoint(value)) return true;
  if (!remoteApiUrl) return false;
  try { return validateRemoteApiUrl(value) === validateRemoteApiUrl(remoteApiUrl); } catch { return false; }
}

export interface AppConfig { title: string; localEndpoint: string; remoteEnabled: boolean; remoteApiUrl: string | null; modelProfile: string; inputMethods: string[]; automaticFallback: boolean; suggestions: { enabled: boolean; rawRowsIncluded: boolean } }

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  if (Object.keys(value).sort().join("|") !== [...expected].sort().join("|")) throw new Error(`${label} contains missing or unknown fields.`);
}

export function validateAppConfig(value: unknown): AppConfig {
  if (!value || typeof value !== "object") throw new Error("App configuration must be an object.");
  const app = value as Record<string, unknown>;
  exactKeys(app, ["schemaVersion", "title", "modelProfile", "inputMethods", "automaticFallback", "localEndpoint", "remoteEnabled", "remoteApiUrl", "suggestions"], "App configuration");
  if (app.schemaVersion !== 1 || app.title !== "BatteryAI" || typeof app.modelProfile !== "string" || !app.modelProfile || !Array.isArray(app.inputMethods) || app.inputMethods.length < 1 || new Set(app.inputMethods).size !== app.inputMethods.length || app.inputMethods.some((method) => !["upload", "paste", "table"].includes(String(method))) || typeof app.automaticFallback !== "boolean") throw new Error("App configuration has invalid core fields.");
  if (typeof app.localEndpoint !== "string" || !isLoopbackEndpoint(app.localEndpoint)) throw new Error("Local endpoint must be loopback HTTP.");
  if (typeof app.remoteEnabled !== "boolean") throw new Error("Remote mode flag must be boolean.");
  if (app.remoteApiUrl !== null && typeof app.remoteApiUrl !== "string") throw new Error("Remote API URL must be null or a string.");
  if (app.remoteEnabled && !app.remoteApiUrl) throw new Error("Remote mode requires a configured remote API URL.");
  if (app.remoteApiUrl) app.remoteApiUrl = validateRemoteApiUrl(app.remoteApiUrl);
  if (!app.suggestions || typeof app.suggestions !== "object") throw new Error("Suggestion configuration is invalid.");
  const suggestions = app.suggestions as Record<string, unknown>; exactKeys(suggestions, ["enabled", "rawRowsIncluded"], "Suggestion configuration");
  if (typeof suggestions.enabled !== "boolean" || suggestions.rawRowsIncluded !== false) throw new Error("Suggestion configuration is invalid.");
  return value as AppConfig;
}

export function applyBuildDeploymentConfig(value: unknown, environment: Record<string, string | boolean | undefined> = import.meta.env): AppConfig {
  if (!value || typeof value !== "object") return validateAppConfig(value);
  const enabledValue = environment.VITE_BATTERYAI_REMOTE_MODE;
  const remoteEnabled = enabledValue === "1" || enabledValue === "true" || enabledValue === true;
  if (!remoteEnabled) return validateAppConfig(value);
  const remoteApiUrl = environment.VITE_BATTERYAI_REMOTE_API_URL;
  if (typeof remoteApiUrl !== "string" || !remoteApiUrl) throw new Error("Remote production build requires VITE_BATTERYAI_REMOTE_API_URL.");
  return validateAppConfig({ ...(value as Record<string, unknown>), remoteEnabled: true, remoteApiUrl });
}

export function validateModelProfile(value: unknown): ModelProfile {
  if (!value || typeof value !== "object") throw new Error("Model profile must be an object.");
  const raw = value as Record<string, unknown>;
  exactKeys(raw, ["schemaVersion", "id", "title", "target", "modelSha256", "activeExperts", "maskedExperts", "browserModel", "preprocessing", "localModel", "limitations", "outputSchema"], "Model profile");
  const profile = value as ModelProfile;
  if (profile.schemaVersion !== 1 || !profile.id || !profile.title || !profile.target || !/^[a-f0-9]{64}$/.test(profile.modelSha256) || profile.activeExperts?.join("|") !== activeExperts.join("|") || profile.maskedExperts?.join("|") !== maskedExperts.join("|") || !profile.browserModel || !profile.localModel || !Array.isArray(profile.limitations) || profile.limitations.some((item) => typeof item !== "string")) throw new Error("Model profile validation failed.");
  if (profile.browserModel.available || profile.browserModel.path !== null) throw new Error("Oxford V1 browser ML must remain disabled until all parity gates pass.");
  if (!profile.localModel.available || !isLoopbackEndpoint(profile.localModel.defaultEndpoint)) throw new Error("Model profile local endpoint must be available on loopback HTTP.");
  const preprocessing = profile.preprocessing;
  if (!preprocessing || preprocessing.featureMean.length !== 4 || preprocessing.featureStd.length !== 4 || preprocessing.featureStd.some((value) => !Number.isFinite(value) || value <= 0) || !Number.isFinite(preprocessing.targetMean) || !Number.isFinite(preprocessing.targetStd) || preprocessing.targetStd <= 0) throw new Error("Model profile preprocessing is invalid.");
  return profile;
}
