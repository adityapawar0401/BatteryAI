import { useEffect, useMemo, useRef, useState } from "react";
import { AutoInferenceProvider } from "./inference/auto";
import { BrowserOnnxInferenceProvider } from "./inference/browser";
import { LocalHttpInferenceProvider } from "./inference/local";
import { LocalOllamaSuggestionProvider } from "./llm/provider";
import { SuggestionPanel, type LocalLlmStatus } from "./llm/SuggestionPanel";
import { columns, parseCsv, readCsvFile, resultsToCsv, validateRows } from "./csv";
import { applyBuildDeploymentConfig, validateModelProfile, type AppConfig } from "./config";
import type { BackendMode, CurveRow, InferenceResponse, ModelProfile, PredictionResult } from "./types";
import "./styles.css";

type Tab = "upload" | "paste" | "table";
type JsonSchema = { properties: { rows: { items: { properties: Record<string, { description?: string; "x-unit"?: string }> } } } };

const base = import.meta.env.BASE_URL;
const labels: Record<string, string> = { sequence_id: "Sequence", cell_id: "Cell", source_checkpoint: "Source checkpoint", target_checkpoint: "Target checkpoint", modality: "Curve modality", point_index: "Point", time_s: "Time", voltage_V: "Voltage", capacity_Ah: "Capacity coordinate", temperature_K: "Temperature", actual_soh: "Actual SOH" };

function download(name: string, content: string, type = "text/plain"): void {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([content], { type })); anchor.download = name; anchor.click(); URL.revokeObjectURL(anchor.href);
}

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [profile, setProfile] = useState<ModelProfile | null>(null);
  const [schema, setSchema] = useState<JsonSchema | null>(null);
  const [startupError, setStartupError] = useState("");
  const [tab, setTab] = useState<Tab>("paste");
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<CurveRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("Load an example or provide Oxford curve rows.");
  const [mode, setMode] = useState<BackendMode>("auto");
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:8000");
  const [token, setToken] = useState(() => sessionStorage.getItem("batteryai-pairing-token") ?? "");
  const [paired, setPaired] = useState(false);
  const [device, setDevice] = useState("—");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<InferenceResponse | null>(null);
  const [llmStatus, setLlmStatus] = useState<LocalLlmStatus>("unavailable");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${base}config/app.json`).then((r) => r.ok ? r.json() : Promise.reject(new Error("app configuration missing"))),
      fetch(`${base}config/oxford-v1.json`).then((r) => r.ok ? r.json() : Promise.reject(new Error("model profile missing"))),
      fetch(`${base}config/oxford-input-schema.json`).then((r) => r.ok ? r.json() : Promise.reject(new Error("input schema missing"))),
    ]).then(([app, model, input]) => {
      const validatedApp = applyBuildDeploymentConfig(app); const validatedProfile = validateModelProfile(model);
      if (validatedApp.modelProfile !== validatedProfile.id) throw new Error("App and model profile selections do not match.");
      setConfig(validatedApp); setProfile(validatedProfile); setSchema(input); setEndpoint(validatedApp.remoteEnabled ? validatedApp.remoteApiUrl! : validatedApp.localEndpoint);
    }).catch((error) => setStartupError(error instanceof Error ? error.message : "Configuration failed."));
  }, []);

  const local = useMemo(() => new LocalHttpInferenceProvider(endpoint.replace(/\/$/, ""), token, profile?.modelSha256, config?.remoteEnabled ? config.remoteApiUrl : null), [endpoint, token, profile, config]);
  const browser = useMemo(() => profile ? new BrowserOnnxInferenceProvider(profile) : null, [profile]);
  const suggestionProvider = useMemo(() => new LocalOllamaSuggestionProvider(endpoint.replace(/\/$/, ""), token, config?.remoteEnabled ? config.remoteApiUrl : null), [endpoint, token, config]);

  function acceptText(text: string): void {
    setCsvText(text);
    try { const parsed = parseCsv(text); setRows(parsed); setErrors([]); setNotice(`${parsed.length.toLocaleString()} rows parsed. Validate before prediction.`); }
    catch (error) { setRows([]); setErrors([error instanceof Error ? error.message : "CSV parsing failed."]); }
  }
  function validate(): boolean {
    const next = validateRows(rows); setErrors(next); setNotice(next.length ? "Validation found problems." : `${rows.length.toLocaleString()} rows satisfy the canonical contract.`); return next.length === 0;
  }
  async function loadExample(): Promise<void> {
    const text = await fetch(`${base}fixtures/oxford-real-example.csv`).then((r) => r.text()); acceptText(text); setTab("table");
  }
  async function pair(): Promise<void> {
    const capability = await local.capability(); setPaired(capability.available); setDevice(capability.device ?? "—");
    if (capability.available) { sessionStorage.setItem("batteryai-pairing-token", token); setNotice(`Paired with ${capability.device}; model ${capability.modelSha256?.slice(0, 12)}…`); setErrors([]); }
    else setErrors([capability.reason ?? "Pairing failed."]);
  }
  async function runPrediction(): Promise<void> {
    if (!profile || !browser || !validate()) return;
    setBusy(true); setResponse(null); abortRef.current = new AbortController();
    try {
      let result: InferenceResponse;
      if (mode === "local") { if (!paired) throw new Error("Pair the local engine before sending battery data."); result = await local.infer(rows, abortRef.current.signal); }
      else if (mode === "browser") result = await browser.infer(rows, abortRef.current.signal);
      else result = await new AutoInferenceProvider(browser, local, paired).infer(rows, abortRef.current.signal);
      setResponse(result); setDevice(result.results[0]?.runtime_device ?? "—"); setNotice(`${result.results.length} prediction${result.results.length === 1 ? "" : "s"} completed with ${result.results[0]?.backend}.`);
    } catch (error) { setErrors([error instanceof Error ? error.message : "Inference failed."]); }
    finally { setBusy(false); }
  }
  function editRow(index: number, field: keyof CurveRow, value: string): void {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: ["point_index", "time_s", "voltage_V", "capacity_Ah", "temperature_K", "actual_soh"].includes(field) ? (value === "" && field === "actual_soh" ? null : Number(value)) : value } as CurveRow : row));
  }
  function addRow(): void {
    const previous = rows.at(-1);
    setRows((current) => [...current, { sequence_id: previous?.sequence_id ?? "sequence-1", cell_id: previous?.cell_id ?? "", source_checkpoint: previous?.source_checkpoint ?? "", target_checkpoint: previous?.target_checkpoint ?? "", modality: previous?.modality ?? "C1ch", point_index: previous ? previous.point_index + 1 : 0, time_s: previous?.time_s ?? 0, voltage_V: previous?.voltage_V ?? 0, capacity_Ah: previous?.capacity_Ah ?? 0, temperature_K: previous?.temperature_K ?? 298.15, actual_soh: previous?.actual_soh ?? null }]);
    setTab("table");
  }

  if (startupError) return <main className="shell"><section className="card error"><h1>BatteryAI could not start</h1><p>{startupError}</p></section></main>;
  if (!config || !profile || !schema) return <main className="shell"><p>Loading validated BatteryAI configuration…</p></main>;
  const propertySchema = schema.properties.rows.items.properties;

  return <main className="shell">
    <header className="hero">
      <div><p className="eyebrow">Local-first battery intelligence</p><h1>BatteryAI</h1><p className="lede">Next-checkpoint Oxford SOH prediction, with the numbers kept separate from interpretation.</p>{config.remoteEnabled && <p className="warning">Inference runs on the paired host computer, which must remain online. The numerical model and Ollama do not run on GitHub Pages.</p>}</div>
      <div className="status-grid" aria-label="Runtime status"><span><b>Model</b>{profile.title}</span><span><b>Backend</b>{response?.results[0]?.backend ?? mode}</span><span><b>Device</b>{device}</span><span><b>Local LLM</b>{llmStatus}</span></div>
    </header>

    <section className="card model-card"><div><p className="eyebrow">Model profile</p><h2>{profile.target}</h2><p className="hash">SHA-256 {profile.modelSha256.slice(0, 16)}…</p></div><div><h3>Active experts</h3><div className="chips">{profile.activeExperts.map((expert) => <span key={expert}>{expert}</span>)}</div></div><details><summary>Limits and masked capabilities</summary><ul>{profile.limitations.map((item) => <li key={item}>{item}</li>)}</ul><p>Masked: {profile.maskedExperts.join(", ")}</p><p>Browser ML: {profile.browserModel.reason}</p></details></section>

    <section className="card">
      <div className="section-heading"><div><p className="eyebrow">1 · Input</p><h2>Oxford curve data</h2></div><div className="actions"><a className="button secondary" href={`${base}fixtures/oxford-template.csv`} download>Download template</a><button className="secondary" onClick={loadExample}>Load real example</button></div></div>
      <div className="tabs" role="tablist">{(["upload", "paste", "table"] as Tab[]).map((item) => <button role="tab" aria-selected={tab === item} key={item} onClick={() => setTab(item)}>{item === "upload" ? "Upload CSV" : item === "paste" ? "Paste CSV" : "Edit table"}</button>)}</div>
      {tab === "upload" && <label className="dropzone">Choose a CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) readCsvFile(file).then(acceptText).catch((error) => setErrors([error instanceof Error ? error.message : "CSV upload failed."])); }} /></label>}
      {tab === "paste" && <label>CSV text<textarea rows={12} value={csvText} onChange={(event) => setCsvText(event.target.value)} aria-describedby="csv-columns" /><small id="csv-columns">Columns: {columns.join(", ")}</small><button onClick={() => acceptText(csvText)}>Parse pasted CSV</button></label>}
      {tab === "table" && <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column} title={propertySchema[column]?.description}>{labels[column]}{column !== "actual_soh" && <i>*</i>}<small>{propertySchema[column]?.["x-unit"]}</small></th>)}</tr></thead><tbody>{rows.slice(0, 100).map((row, index) => <tr key={`${row.sequence_id}-${index}`}>{columns.map((column) => <td key={column}><input aria-label={`${labels[column]} row ${index + 1}`} value={row[column] ?? ""} onChange={(event) => editRow(index, column, event.target.value)} /></td>)}</tr>)}</tbody></table>{rows.length > 100 && <p className="muted">Showing the first 100 of {rows.length.toLocaleString()} editable rows. All rows will be validated and inferred.</p>}</div>}
      <div className="actions"><button className="secondary" onClick={addRow}>Add table row</button><button onClick={validate}>Validate</button><button onClick={runPrediction} disabled={busy || !rows.length}>{busy ? "Running…" : "Run prediction"}</button>{busy && <button className="secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>}<button className="ghost" onClick={() => { setRows([]); setCsvText(""); setResponse(null); setErrors([]); setNotice("Cleared."); }}>Clear</button></div>
      <p className="notice" role="status">{notice}</p>{errors.length > 0 && <div className="error" role="alert"><strong>Needs attention</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    </section>

    <section className="card"><p className="eyebrow">2 · Inference backend</p><h2>Choose where numerical ML runs</h2><div className="backend-grid"><label>Backend<select value={mode} onChange={(event) => setMode(event.target.value as BackendMode)}><option value="auto">Auto</option><option value="browser">Browser</option><option value="local">Host computer</option></select></label><label>{config.remoteEnabled ? "Configured Funnel backend" : "Local endpoint"}<input value={endpoint} readOnly={config.remoteEnabled} onChange={(event) => { setEndpoint(event.target.value); setPaired(false); }} /></label><label>Pairing token<input type="password" autoComplete="off" value={token} onChange={(event) => { setToken(event.target.value); setPaired(false); }} /></label><button onClick={pair}>Test & pair host engine</button></div><p className="muted">The backend is shown before pairing. The token stays in sessionStorage for this browser tab only, and no request is made before explicit pairing.</p></section>

    <section className="card"><div className="section-heading"><div><p className="eyebrow">3 · Results</p><h2>Numerical ML predictions</h2></div>{response && <div className="actions"><button className="secondary" onClick={() => download("batteryai-results.json", JSON.stringify(response, null, 2), "application/json")}>Export JSON</button><button className="secondary" onClick={() => download("batteryai-results.csv", resultsToCsv(response.results as unknown as Record<string, unknown>[]), "text/csv")}>Export CSV</button></div>}</div>
      {!response && <div className="empty">Validated predictions will appear here.</div>}
      {response && <><div className="result-grid">{response.results.map((result) => <article className="result" key={result.sequence_id}><p>{result.cell_id} · {result.source_checkpoint} → {result.target_checkpoint}</p><strong>{result.predicted_soh.toFixed(2)}<small>% predicted SOH</small></strong><dl><div><dt>Predictive std.</dt><dd>{result.predictive_std.toFixed(2)} pp</dd></div>{result.actual_soh != null && <div><dt>Actual SOH</dt><dd>{result.actual_soh.toFixed(2)}%</dd></div>}{result.absolute_error != null && <div><dt>Absolute error</dt><dd>{result.absolute_error.toFixed(2)} pp</dd></div>}<div><dt>Runtime</dt><dd>{result.timing.total_ms.toFixed(0)} ms</dd></div><div><dt>Backend / device</dt><dd>{result.backend} / {result.runtime_device}</dd></div></dl>{result.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</article>)}</div>{response.results.length > 1 && <SohChart results={response.results} />}</>}
    </section>

    <SuggestionPanel paired={paired} latestResult={response?.results[0] ?? null} provider={suggestionProvider} onStatusChange={setLlmStatus} />
  </main>;
}

function SohChart({ results }: { results: PredictionResult[] }) {
  const values = results.map((result) => result.predicted_soh); const min = Math.min(...values); const max = Math.max(...values); const span = Math.max(max - min, 1);
  const points = values.map((value, index) => `${20 + index * (560 / Math.max(values.length - 1, 1))},${180 - ((value - min) / span) * 140}`).join(" ");
  return <figure><figcaption>Ordered predicted SOH</figcaption><svg viewBox="0 0 600 200" role="img" aria-label="SOH prediction line chart"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="4" /></svg></figure>;
}

export default App;
