/**
 * Customer-facing text guard.
 *
 * The analysis service is not asked to name any internal component, so generated
 * text should already be clean. This is the second layer: anything that still
 * carries an internal term is dropped or replaced before it reaches the screen,
 * so a model slip cannot leak implementation detail into the product UI.
 *
 * This filters presentation only. It never touches numbers, validation, the
 * request or response contracts, or error handling.
 */

const internalTerms = [
  "oxford", "pimoe", "battery-pimoe", "ollama", "llama", "onnx", "fastapi", "tailscale", "funnel",
  "github pages", "cuda", "checkpoint", "sha-256", "sha256", "active expert", "masked expert",
  "model profile", "rul", "remaining useful life", "next-observed-checkpoint", "next observed checkpoint",
  "loopback", "local llm", "remote backend", "host computer", "inference provider", "browser ml",
  "ts.net", "pytorch", "training cell", "training-cell", "webgpu", "wasm",
  "state of charge", "soc", "model", "accuracy", "error rate", "prediction error", "input quality",
  "software", "calibration", "user manual", "training", "dataset", "architecture", "provider",
  "infrastructure", "implementation", "cpu",
];

/**
 * Word-boundary matching so ordinary copy such as "curated" or "serial" is never
 * caught. The left boundary also excludes "_" so the canonical column names
 * `source_checkpoint` and `target_checkpoint`, which users need and which stay
 * visible, are not mistaken for internal vocabulary.
 */
const internalPattern = new RegExp(`(?:^|[^a-z0-9_])(?:${internalTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:[^a-z0-9_]|$)`, "i");

export function containsInternalTerm(value: string): boolean {
  return internalPattern.test(normalizeClientText(value));
}

/** Keeps only the customer-safe entries of a generated list. */
export function keepClientSafe(values: string[]): string[] {
  return values.map(normalizeClientText).filter((value) => !containsInternalTerm(value));
}

/** Normalizes model-generated punctuation before any text can be rendered. */
export function normalizeClientText(value: string): string {
  return value
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/\u2248\s*/g, "about ")
    .replace(/(\b(?:predictive[\s-]+)?uncertainty\b(?:(?!\b(?:SOH|state[\s-]+of[\s-]+health)\b)[^.!?\r\n]){0,60}?)(\d+(?:\.\d+)?)\s*%/gi, "$1$2 percentage points")
    .replace(/(\d+(?:\.\d+)?)\s*%(\s+(?:of[\s-]+)?(?:predictive[\s-]+)?uncertainty\b)/gi, "$1 percentage points$2")
    .replace(/\bpercentage[\s-]+points?[\s-]+points?\b/gi, "percentage points")
    .trim();
}

export const genericAnalysisSummary = "The battery health analysis completed successfully. Review the estimated state of health together with its uncertainty.";

/** Replaces a summary that names internal components with an equivalent product-level statement. */
export function clientSafeSummary(value: string): string {
  const normalized = normalizeClientText(value);
  return containsInternalTerm(normalized) ? genericAnalysisSummary : normalized;
}

const CONNECTION_REQUIRED = "Connect to the analysis service before running an analysis.";
const SERVICE_UNAVAILABLE = "The analysis service is currently unavailable.";
const ACCESS_CODE_REJECTED = "The access code is invalid or has expired.";
export const INSIGHTS_UNAVAILABLE = "AI insights are temporarily unavailable.";

/**
 * Turns a service-layer message into something a customer can act on. Detailed
 * technical failures still reach the service logs unchanged; this only governs
 * what is rendered. Messages that are already customer-safe, notably CSV
 * validation errors that users need verbatim to fix their file, pass through.
 */
export function clientErrorMessage(raw: string): string {
  const message = normalizeClientText(raw);
  if (!message) return SERVICE_UNAVAILABLE;
  const lower = message.toLowerCase();

  if (lower.includes("token") || lower.includes("401") || lower.includes("unauthor")) return ACCESS_CODE_REJECTED;
  if (lower.includes("pair the local engine") || lower.includes("before pairing") || lower.includes("pair the batteryai") || lower.includes("browser ml is unavailable")) return CONNECTION_REQUIRED;
  if (lower.includes("suggestion") || lower.includes("ollama") || lower.includes("llm")) return INSIGHTS_UNAVAILABLE;
  if (lower.includes("rate limit") || lower.includes("too many requests")) return "The analysis service is busy. Wait a moment and try again.";
  if (lower.includes("aborted") || lower.includes("cancel")) return "The request was cancelled.";

  return containsInternalTerm(message) || lower.includes("http ") || lower.includes("endpoint") || lower.includes("fetch") ? SERVICE_UNAVAILABLE : message;
}
