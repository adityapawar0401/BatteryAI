import { normalizeClientText } from "../clientText";

export const usageGuidanceLabels = {
  normal_use: "Normal Use",
  monitor_more_closely: "Monitor More Closely",
  conservative_use: "Conservative Use",
  service_or_replacement_review: "Service / Replacement Review",
} as const;

export type UsageGuidance = keyof typeof usageGuidanceLabels;
export interface Suggestions { summary: string; usage_guidance: UsageGuidance; actions: string[]; cautions: string[] }

function isUsageGuidance(value: unknown): value is UsageGuidance {
  return typeof value === "string" && value in usageGuidanceLabels;
}

export function parseSuggestions(value: unknown): Suggestions {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") throw new Error("Suggestion output is not an object.");
  const candidate = parsed as Record<string, unknown>;
  if (Object.keys(candidate).sort().join("|") !== "actions|cautions|summary|usage_guidance" || typeof candidate.summary !== "string" || !isUsageGuidance(candidate.usage_guidance) || !Array.isArray(candidate.actions) || candidate.actions.length < 2 || candidate.actions.length > 4 || !Array.isArray(candidate.cautions) || candidate.cautions.length < 1 || candidate.cautions.length > 3) throw new Error("Suggestion output did not match the safe display schema.");
  const summary = normalizeClientText(candidate.summary);
  const actions = candidate.actions.map((item) => typeof item === "string" ? normalizeClientText(item) : item);
  const cautions = candidate.cautions.map((item) => typeof item === "string" ? normalizeClientText(item) : item);
  if (!summary || summary.length > 1000 || /[<>\r\n]/.test(summary) || !actions.every((item) => typeof item === "string" && !!item && item.length <= 500 && !/[<>]/.test(item)) || !cautions.every((item) => typeof item === "string" && !!item && item.length <= 500 && !/[<>]/.test(item))) throw new Error("Suggestion output did not match the safe display schema.");
  return { summary, usage_guidance: candidate.usage_guidance, actions: actions as string[], cautions: cautions as string[] };
}
