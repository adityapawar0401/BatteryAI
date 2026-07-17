import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AutoInferenceProvider } from "../inference/auto";
import { BrowserOnnxInferenceProvider } from "../inference/browser";
import { LocalHttpInferenceProvider } from "../inference/local";
import { LocalOllamaSuggestionProvider } from "../llm/provider";
import { SuggestionPanel, type LocalLlmStatus } from "../llm/SuggestionPanel";
import { parseCsv, readCsvFile, resultsToCsv, validateRows } from "../csv";
import { applyBuildDeploymentConfig, validateModelProfile, type AppConfig } from "../config";
import { assetPath } from "../routes";
import type { BackendMode, CurveRow, InferenceResponse, ModelProfile } from "../types";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";
import { DataInputSection, type FieldSchema, type Tab } from "./DataInputSection";
import { OverviewSection } from "./OverviewSection";
import { PredictionSection } from "./PredictionSection";
import { SystemStatusSection } from "./SystemStatusSection";
import { ValidationSection } from "./ValidationSection";
import { summarizeRows } from "./summary";
import "../styles/tokens.css";
import "../styles/components.css";
import "../styles/dashboard.css";

type JsonSchema = { properties: { rows: { items: { properties: FieldSchema } } } };

function download(name: string, content: string, type = "text/plain"): void {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([content], { type })); anchor.download = name; anchor.click(); URL.revokeObjectURL(anchor.href);
}

export function DashboardPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [profile, setProfile] = useState<ModelProfile | null>(null);
  const [schema, setSchema] = useState<JsonSchema | null>(null);
  const [startupError, setStartupError] = useState("");
  const [tab, setTab] = useState<Tab>("paste");
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<CurveRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);
  const [notice, setNotice] = useState("Load an example or provide Oxford curve rows.");
  const [mode, setMode] = useState<BackendMode>("auto");
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:8000");
  const [token, setToken] = useState(() => sessionStorage.getItem("batteryai-pairing-token") ?? "");
  const [paired, setPaired] = useState(false);
  const [device, setDevice] = useState("—");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<InferenceResponse | null>(null);
  const [llmStatus, setLlmStatus] = useState<LocalLlmStatus>("unavailable");
  const [navOpen, setNavOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(assetPath("config/app.json")).then((r) => r.ok ? r.json() : Promise.reject(new Error("app configuration missing"))),
      fetch(assetPath("config/oxford-v1.json")).then((r) => r.ok ? r.json() : Promise.reject(new Error("model profile missing"))),
      fetch(assetPath("config/oxford-input-schema.json")).then((r) => r.ok ? r.json() : Promise.reject(new Error("input schema missing"))),
    ]).then(([app, model, input]) => {
      const validatedApp = applyBuildDeploymentConfig(app); const validatedProfile = validateModelProfile(model);
      if (validatedApp.modelProfile !== validatedProfile.id) throw new Error("App and model profile selections do not match.");
      setConfig(validatedApp); setProfile(validatedProfile); setSchema(input); setEndpoint(validatedApp.remoteEnabled ? validatedApp.remoteApiUrl! : validatedApp.localEndpoint);
    }).catch((error) => setStartupError(error instanceof Error ? error.message : "Configuration failed."));
  }, []);

  const local = useMemo(() => new LocalHttpInferenceProvider(endpoint.replace(/\/$/, ""), token, profile?.modelSha256, config?.remoteEnabled ? config.remoteApiUrl : null), [endpoint, token, profile, config]);
  const browser = useMemo(() => profile ? new BrowserOnnxInferenceProvider(profile) : null, [profile]);
  const suggestionProvider = useMemo(() => new LocalOllamaSuggestionProvider(endpoint.replace(/\/$/, ""), token, config?.remoteEnabled ? config.remoteApiUrl : null), [endpoint, token, config]);
  const summary = useMemo(() => summarizeRows(rows), [rows]);
  const closeNav = useCallback(() => setNavOpen(false), []);

  function acceptText(text: string): void {
    setCsvText(text); setValidated(false);
    try { const parsed = parseCsv(text); setRows(parsed); setErrors([]); setNotice(`${parsed.length.toLocaleString()} rows parsed. Validate before prediction.`); }
    catch (error) { setRows([]); setErrors([error instanceof Error ? error.message : "CSV parsing failed."]); }
  }
  function validate(): boolean {
    const next = validateRows(rows); setErrors(next); setValidated(next.length === 0);
    setNotice(next.length ? "Validation found problems." : `${rows.length.toLocaleString()} rows satisfy the canonical contract.`); return next.length === 0;
  }
  async function loadExample(): Promise<void> {
    const text = await fetch(assetPath("fixtures/oxford-real-example.csv")).then((r) => r.text()); acceptText(text); setTab("table");
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
    setValidated(false);
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: ["point_index", "time_s", "voltage_V", "capacity_Ah", "temperature_K", "actual_soh"].includes(field) ? (value === "" && field === "actual_soh" ? null : Number(value)) : value } as CurveRow : row));
  }
  function addRow(): void {
    const previous = rows.at(-1);
    setValidated(false);
    setRows((current) => [...current, { sequence_id: previous?.sequence_id ?? "sequence-1", cell_id: previous?.cell_id ?? "", source_checkpoint: previous?.source_checkpoint ?? "", target_checkpoint: previous?.target_checkpoint ?? "", modality: previous?.modality ?? "C1ch", point_index: previous ? previous.point_index + 1 : 0, time_s: previous?.time_s ?? 0, voltage_V: previous?.voltage_V ?? 0, capacity_Ah: previous?.capacity_Ah ?? 0, temperature_K: previous?.temperature_K ?? 298.15, actual_soh: previous?.actual_soh ?? null }]);
    setTab("table");
  }
  function clear(): void {
    setRows([]); setCsvText(""); setResponse(null); setErrors([]); setValidated(false); setNotice("Cleared.");
  }

  if (startupError) return <main className="dash-startup"><section className="dash-error"><h1>BatteryAI could not start</h1><p>{startupError}</p></section></main>;
  if (!config || !profile || !schema) return <main className="dash-startup"><p>Loading validated BatteryAI configuration…</p></main>;

  return <div className="dash">
    <a className="skip-link" href="#overview">Skip to content</a>
    <DashboardSidebar open={navOpen} onClose={closeNav} />
    <div className="dash-main">
      <DashboardHeader remoteEnabled={config.remoteEnabled} endpoint={endpoint} paired={paired} device={device} llmStatus={llmStatus} navOpen={navOpen} onOpenNav={() => setNavOpen(true)} />
      <div className="dash-body">
        {config.remoteEnabled && <p className="dash-warning">Inference runs on the paired host computer, which must remain online. The numerical model and Ollama do not run on GitHub Pages.</p>}
        <OverviewSection response={response} profile={profile} />
        <DataInputSection
          tab={tab} onTabChange={setTab} csvText={csvText} onCsvTextChange={setCsvText} onAcceptText={acceptText}
          onUpload={(file) => readCsvFile(file).then(acceptText).catch((error) => setErrors([error instanceof Error ? error.message : "CSV upload failed."]))}
          rows={rows} summary={summary} fieldSchema={schema.properties.rows.items.properties} notice={notice}
          onEditRow={editRow} onAddRow={addRow} onValidate={validate} onClear={clear} onLoadExample={loadExample}
        />
        <ValidationSection summary={summary} errors={errors} validated={validated} />
        <PredictionSection
          profile={profile} remoteEnabled={config.remoteEnabled} mode={mode} onModeChange={setMode}
          endpoint={endpoint} onEndpointChange={(value) => { setEndpoint(value); setPaired(false); }}
          token={token} onTokenChange={(value) => { setToken(value); setPaired(false); }}
          paired={paired} device={device} busy={busy} rowCount={rows.length} response={response}
          onPair={pair} onRun={runPrediction} onCancel={() => abortRef.current?.abort()}
          onExportJson={() => download("batteryai-results.json", JSON.stringify(response, null, 2), "application/json")}
          onExportCsv={() => download("batteryai-results.csv", resultsToCsv((response?.results ?? []) as unknown as Record<string, unknown>[]), "text/csv")}
        />
        <SuggestionPanel paired={paired} latestResult={response?.results[0] ?? null} provider={suggestionProvider} onStatusChange={setLlmStatus} />
        <SystemStatusSection config={config} profile={profile} endpoint={endpoint} paired={paired} device={device} llmStatus={llmStatus} />
      </div>
    </div>
  </div>;
}
