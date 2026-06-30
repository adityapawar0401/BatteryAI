export interface Suggestions { summary: string; actions: string[]; cautions: string[] }
export function parseSuggestions(value: string): Suggestions {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") throw new Error("Suggestion output is not an object.");
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.summary !== "string" || !Array.isArray(candidate.actions) || !Array.isArray(candidate.cautions) || !candidate.actions.every((v) => typeof v === "string") || !candidate.cautions.every((v) => typeof v === "string")) throw new Error("Suggestion output did not match the safe display schema.");
  return { summary: candidate.summary, actions: candidate.actions.slice(0, 5), cautions: candidate.cautions.slice(0, 5) };
}
