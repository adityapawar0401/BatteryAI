import { useEffect, useRef, useState } from "react";
import type { PredictionResult } from "../types";
import { clientErrorMessage, clientSafeSummary, keepClientSafe, INSIGHTS_UNAVAILABLE } from "../clientText";
import { type LocalLlmCapabilities, type SuggestionProvider } from "./provider";
import { parseSuggestions, type Suggestions } from "./schema";

export type LocalLlmStatus = "unavailable" | "checking" | "ready" | "generating" | "completed" | "error";

interface SuggestionPanelProps {
  paired: boolean;
  latestResult: PredictionResult | null;
  provider: SuggestionProvider;
  onStatusChange?: (status: LocalLlmStatus) => void;
}

/** Customer-facing wording for each internal state; the state machine is unchanged. */
const statusLabel: Record<LocalLlmStatus, string> = {
  unavailable: "Unavailable",
  checking: "Checking",
  ready: "Ready",
  generating: "Generating",
  completed: "Completed",
  error: "Unavailable",
};

function resultKey(result: PredictionResult | null): string { return result ? `${result.request_id}:${result.sequence_id}` : ""; }

export function SuggestionPanel({ paired, latestResult, provider, onStatusChange }: SuggestionPanelProps) {
  const [status, setStatus] = useState<LocalLlmStatus>("unavailable");
  const [capability, setCapability] = useState<LocalLlmCapabilities | null>(null);
  const [message, setMessage] = useState("Connect to check whether insights are available.");
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const latestResultRef = useRef(latestResult);
  const previousResultKey = useRef(resultKey(latestResult));
  const generationAbort = useRef<AbortController | null>(null);

  useEffect(() => { onStatusChange?.(status); }, [onStatusChange, status]);
  useEffect(() => {
    latestResultRef.current = latestResult;
    const next = resultKey(latestResult);
    if (previousResultKey.current && next !== previousResultKey.current) {
      setSuggestions(null); setError("");
      if (capability?.ready) { setStatus("ready"); setMessage("Ready for the latest completed analysis."); }
    }
    previousResultKey.current = next;
  }, [capability?.ready, latestResult]);
  useEffect(() => {
    if (!paired) {
      setCapability(null); setStatus("unavailable"); setMessage("Connect to check whether insights are available."); setError("");
      return;
    }
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [paired, provider]);

  async function check(signal?: AbortSignal): Promise<void> {
    setStatus("checking"); setError(""); setMessage("Checking whether insights are available…");
    try {
      const next = await provider.capability(signal); setCapability(next);
      if (next.ready && next.generation_available) { setStatus("ready"); setMessage("Insights are ready to generate."); }
      else { setStatus("unavailable"); setMessage(INSIGHTS_UNAVAILABLE); }
    } catch (checkError) {
      if (checkError instanceof DOMException && checkError.name === "AbortError") return;
      setStatus("error"); setError(INSIGHTS_UNAVAILABLE);
    }
  }

  async function generate(): Promise<void> {
    const result = latestResultRef.current;
    if (!result || !capability?.ready || !paired) return;
    const requestedKey = resultKey(result); const controller = new AbortController(); generationAbort.current = controller;
    setStatus("generating"); setMessage("Generating insights from the latest completed analysis…"); setError(""); setSuggestions(null);
    try {
      const response = await provider.generate(result, controller.signal);
      if (resultKey(latestResultRef.current) !== requestedKey) { setStatus("ready"); setMessage("Analysis updated. Generate insights for the latest result."); return; }
      const parsed = parseSuggestions(response.suggestions);
      // Second layer: drop anything that still names an internal component.
      setSuggestions({ summary: clientSafeSummary(parsed.summary), actions: keepClientSafe(parsed.actions), cautions: keepClientSafe(parsed.cautions) });
      setStatus("completed"); setMessage("Insights completed.");
    } catch (generationError) {
      if (generationError instanceof DOMException && generationError.name === "AbortError") { setStatus("ready"); setMessage("Insight generation cancelled."); return; }
      setStatus("error"); setError(clientErrorMessage(generationError instanceof Error ? generationError.message : ""));
    } finally { generationAbort.current = null; }
  }

  const canGenerate = paired && !!latestResult && !!capability?.ready && ["ready", "completed", "error"].includes(status);

  return <section className="dash-section" id="insights" aria-labelledby="suggestion-heading">
    <div className="dash-section__head"><div>
      <p className="eyebrow">Insights</p><h2 id="suggestion-heading">AI Insights</h2>
    </div></div>
    <p className="dash-hint">Insights summarize the completed analysis in plain language. They never change the values above.</p>
    <p className="dash-notice" role="status"><strong>Insights: {statusLabel[status]}</strong> — {message}</p>
    {error && <p className="dash-error" role="alert">{error}</p>}
    <div className="dash-actions dash-actions--wrap">
      {paired && ["unavailable", "error"].includes(status) && <button type="button" className="btn btn--secondary" onClick={() => void check()}>Check again</button>}
      {canGenerate && <button type="button" className="btn" onClick={generate}>Generate insights</button>}
      {status === "generating" && <button type="button" className="btn btn--secondary" onClick={() => generationAbort.current?.abort()}>Cancel</button>}
    </div>
    {suggestions ? <div className="suggestion-output">
      <h3>{suggestions.summary}</h3>
      {suggestions.actions.length > 0 && <><h4 className="mono">Recommended actions</h4><ul>{suggestions.actions.map((item) => <li key={item}>{item}</li>)}</ul></>}
      {suggestions.cautions.length > 0 && <><h4 className="mono">Considerations</h4><ul>{suggestions.cautions.map((item) => <li key={item}>{item}</li>)}</ul></>}
    </div>
      : <div className="dash-empty">{latestResult ? (capability?.ready ? "Insights are ready to generate for the latest completed analysis." : INSIGHTS_UNAVAILABLE) : "Complete an analysis to generate insights."}</div>}
    <p className="dash-warning">AI-generated decision support only—not a safety certification. Insights cannot change the analysis results above.</p>
  </section>;
}
