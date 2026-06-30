import { useEffect, useRef, useState } from "react";
import type { PredictionResult } from "../types";
import { OLLAMA_MODEL, OLLAMA_PULL_COMMAND, type LocalLlmCapabilities, type SuggestionProvider } from "./provider";
import type { Suggestions } from "./schema";

export type LocalLlmStatus = "unavailable" | "checking" | "ready" | "generating" | "completed" | "error";

interface SuggestionPanelProps {
  paired: boolean;
  latestResult: PredictionResult | null;
  provider: SuggestionProvider;
  onStatusChange?: (status: LocalLlmStatus) => void;
}

function resultKey(result: PredictionResult | null): string { return result ? `${result.request_id}:${result.sequence_id}` : ""; }

export function SuggestionPanel({ paired, latestResult, provider, onStatusChange }: SuggestionPanelProps) {
  const [status, setStatus] = useState<LocalLlmStatus>("unavailable");
  const [capability, setCapability] = useState<LocalLlmCapabilities | null>(null);
  const [message, setMessage] = useState("Pair the BatteryAI local service to check Local Ollama.");
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
      if (capability?.ready) { setStatus("ready"); setMessage("Ready for the latest completed prediction."); }
    }
    previousResultKey.current = next;
  }, [capability?.ready, latestResult]);
  useEffect(() => {
    if (!paired) {
      setCapability(null); setStatus("unavailable"); setMessage("Pair the BatteryAI local service to check Local Ollama."); setError("");
      return;
    }
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [paired, provider]);

  async function check(signal?: AbortSignal): Promise<void> {
    setStatus("checking"); setError(""); setMessage("Checking Local Ollama and llama3.2:3b…");
    try {
      const next = await provider.capability(signal); setCapability(next);
      if (next.ready && next.generation_available) { setStatus("ready"); setMessage("Local Ollama is ready."); }
      else { setStatus("unavailable"); setMessage(next.reason ?? "Local Ollama suggestions are unavailable."); }
    } catch (checkError) {
      if (checkError instanceof DOMException && checkError.name === "AbortError") return;
      setStatus("error"); setError(checkError instanceof Error ? checkError.message : "Local LLM capability check failed.");
    }
  }

  async function generate(): Promise<void> {
    const result = latestResultRef.current;
    if (!result || !capability?.ready || !paired) return;
    const requestedKey = resultKey(result); const controller = new AbortController(); generationAbort.current = controller;
    setStatus("generating"); setMessage("Generating suggestions from the latest completed prediction…"); setError(""); setSuggestions(null);
    try {
      const response = await provider.generate(result, controller.signal);
      if (resultKey(latestResultRef.current) !== requestedKey) { setStatus("ready"); setMessage("Prediction updated. Generate suggestions for the latest result."); return; }
      setSuggestions(response.suggestions); setStatus("completed"); setMessage(`Completed locally in ${response.timing.total_ms.toFixed(0)} ms.`);
    } catch (generationError) {
      if (generationError instanceof DOMException && generationError.name === "AbortError") { setStatus("ready"); setMessage("Suggestion generation cancelled."); return; }
      setStatus("error"); setError(generationError instanceof Error ? generationError.message : "Local suggestion generation failed.");
    } finally { generationAbort.current = null; }
  }

  const canGenerate = paired && !!latestResult && !!capability?.ready && ["ready", "completed", "error"].includes(status);

  return <section className="card suggestion" aria-labelledby="suggestion-heading">
    <p className="eyebrow">4 · Optional interpretation</p><h2 id="suggestion-heading">AI-generated suggestions</h2>
    <p>Provider: <strong>Local Ollama</strong> · Model: <strong>{OLLAMA_MODEL}</strong></p>
    <p>The paired BatteryAI service sends only a bounded prediction summary to Ollama on loopback.</p>
    <p className="notice" role="status"><strong>Local LLM: {status}</strong> — {message}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {capability?.corrective_command && <p className="error">Run: <code>{capability.corrective_command}</code></p>}
    <div className="actions">
      {paired && ["unavailable", "error"].includes(status) && <button className="secondary" onClick={() => void check()}>Check local LLM</button>}
      {canGenerate && <button onClick={generate}>Generate suggestions</button>}
      {status === "generating" && <button className="secondary" onClick={() => generationAbort.current?.abort()}>Cancel</button>}
    </div>
    {suggestions ? <div><h3>{suggestions.summary}</h3><h4>Actions</h4><ul>{suggestions.actions.map((item) => <li key={item}>{item}</li>)}</ul><h4>Cautions</h4><ul>{suggestions.cautions.map((item) => <li key={item}>{item}</li>)}</ul></div>
      : <div className="empty">{latestResult ? (capability?.ready ? "Local Ollama is ready to interpret the latest completed prediction." : `Suggestions require local ${OLLAMA_MODEL}.`) : "Complete a numerical prediction to enable suggestions."}</div>}
    {capability && !capability.model_installed && !capability.corrective_command && <p className="muted">If the model is missing, run <code>{OLLAMA_PULL_COMMAND}</code>.</p>}
    <p className="warning">AI-generated decision support only—not a safety certification. Suggestions cannot change the numerical prediction above.</p>
  </section>;
}
