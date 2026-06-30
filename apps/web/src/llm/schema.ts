export interface Suggestions { summary: string; actions: string[]; cautions: string[] }
export function parseSuggestions(value: string): Suggestions {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") throw new Error("Suggestion output is not an object.");
  const candidate = parsed as Record<string, unknown>;
  if (Object.keys(candidate).sort().join("|") !== "actions|cautions|summary" || typeof candidate.summary !== "string" || candidate.summary.length > 1000 || !Array.isArray(candidate.actions) || candidate.actions.length > 5 || !Array.isArray(candidate.cautions) || candidate.cautions.length > 5 || !candidate.actions.every((v) => typeof v === "string" && v.length <= 500) || !candidate.cautions.every((v) => typeof v === "string" && v.length <= 500)) throw new Error("Suggestion output did not match the safe display schema.");
  return { summary: candidate.summary, actions: candidate.actions, cautions: candidate.cautions };
}
