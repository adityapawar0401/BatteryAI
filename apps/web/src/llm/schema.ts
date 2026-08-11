export interface Suggestions { summary: string; actions: string[]; cautions: string[] }
export function parseSuggestions(value: unknown): Suggestions {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") throw new Error("Suggestion output is not an object.");
  const candidate = parsed as Record<string, unknown>;
  if (Object.keys(candidate).sort().join("|") !== "actions|cautions|summary" || typeof candidate.summary !== "string" || !Array.isArray(candidate.actions) || candidate.actions.length < 2 || candidate.actions.length > 4 || !Array.isArray(candidate.cautions) || candidate.cautions.length < 1 || candidate.cautions.length > 3) throw new Error("Suggestion output did not match the safe display schema.");
  const summary = candidate.summary.trim();
  const actions = candidate.actions.map((item) => typeof item === "string" ? item.trim() : item);
  const cautions = candidate.cautions.map((item) => typeof item === "string" ? item.trim() : item);
  if (!summary || summary.length > 1000 || /[<>\r\n]/.test(summary) || !actions.every((item) => typeof item === "string" && !!item && item.length <= 500 && !/[<>]/.test(item)) || !cautions.every((item) => typeof item === "string" && !!item && item.length <= 500 && !/[<>]/.test(item))) throw new Error("Suggestion output did not match the safe display schema.");
  return { summary, actions: actions as string[], cautions: cautions as string[] };
}
