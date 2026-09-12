import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisPageShell } from "../analysis/AnalysisUI";
import { AutoInferenceProvider } from "../inference/auto";
import { BrowserOnnxInferenceProvider } from "../inference/browser";
import { LocalHttpInferenceProvider } from "../inference/local";
import { LocalOllamaSuggestionProvider } from "../llm/provider";
import { SuggestionPanel, type LocalLlmStatus } from "../llm/SuggestionPanel";
import { parseCsv, readCsvFile, resultsToCsv, validateRows } from "../csv";
import { applyBuildDeploymentConfig, validateModelProfile, type AppConfig } from "../config";
import { clientErrorMessage } from "../clientText";
import { assetPath } from "../routes";
import type { BackendMode, CurveRow, FailureResult, InferenceResponse, ModelProfile } from "../types";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";
import { DataInputSection, type FieldSchema, type Tab } from "./DataInputSection";
import { OverviewSection } from "./OverviewSection";
import { emptyOperationalValues, hasOperationalValues, OperationalInputSection } from "./OperationalInputSection";
import { UnifiedResultsSection } from "./UnifiedResultsSection";
import { ValidationSection } from "./ValidationSection";
import { summarizeRows } from "./summary";
import "../styles/tokens.css";
import "../styles/components.css";
import "../styles/analysis.css";
import "../styles/dashboard.css";
import "../styles/failure.css";

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
  const [operationalValues, setOperationalValues] = useState<Record<string, string>>(emptyOperationalValues);
  const [notice, setNotice] = useState("Load the example or add your own battery data.");
  // The analysis route is selected internally and is not a customer-facing choice.
  const [mode] = useState<BackendMode>("auto");
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:8000");
  const [token, setToken] = useState(() => sessionStorage.getItem("batteryai-pairing-token") ?? "");
  const [paired, setPaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<InferenceResponse | null>(null);
  const [failureResult, setFailureResult] = useState<FailureResult | null>(null);
  const [assessmentErrors, setAssessmentErrors] = useState<string[]>([]);
  const [, setLlmStatus] = useState<LocalLlmStatus>("unavailable");
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
    }).catch(() => setStartupError("Re-Li could not start. Refresh to try again."));
  }, []);

  const local = useMemo(() => new LocalHttpInferenceProvider(endpoint.replace(/\/$/, ""), token, profile?.modelSha256, config?.remoteEnabled ? config.remoteApiUrl : null), [endpoint, token, profile, config]);
  const browser = useMemo(() => profile ? new BrowserOnnxInferenceProvider(profile) : null, [profile]);
  const suggestionProvider = useMemo(() => new LocalOllamaSuggestionProvider(endpoint.replace(/\/$/, ""), token, config?.remoteEnabled ? config.remoteApiUrl : null), [endpoint, token, config]);
  const summary = useMemo(() => summarizeRows(rows), [rows]);
  const closeNav = useCallback(() => setNavOpen(false), []);

  function acceptText(text: string): void {
    setCsvText(text); setValidated(false);
    try { const parsed = parseCsv(text); setRows(parsed); setErrors([]); setNotice(`${parsed.length.toLocaleString()} rows added. Validate before running the analysis.`); }
    catch (error) { setRows([]); setErrors([clientErrorMessage(error instanceof Error ? error.message : "")]); }
  }
  function validate(): boolean {
    const next = validateRows(rows); setErrors(next); setValidated(next.length === 0);
    setNotice(next.length ? "Validation found problems." : `${rows.length.toLocaleString()} rows passed validation.`); return next.length === 0;
  }
  async function loadExample(): Promise<void> {
    const text = await fetch(assetPath("fixtures/oxford-real-example.csv")).then((r) => r.text()); acceptText(text); setTab("table");
  }
  async function connect(): Promise<void> {
    const capability = await local.capability(); setPaired(capability.available);
    if (capability.available) { sessionStorage.setItem("batteryai-pairing-token", token); setNotice("Connected securely."); setErrors([]); }
    else setErrors([clientErrorMessage(capability.reason ?? "")]);
  }
  async function runAnalysis(): Promise<void> {
    if (!profile || !browser) return;
    const includeFailure = hasOperationalValues(operationalValues);
    const includeSoh = rows.length > 0;
    if (!includeFailure && !includeSoh) { setAssessmentErrors(["Add operational data, diagnostic curve data, or both before analyzing."]); return; }
    if (!paired) { setAssessmentErrors(["Connect to the analysis service before running an analysis."]); return; }
    if (includeSoh && !validate()) return;

    setBusy(true); setResponse(null); setFailureResult(null); setAssessmentErrors([]); abortRef.current = new AbortController();
    const nextErrors: string[] = [];
    let completed = 0;

    try {
      // Run sequentially because both endpoints intentionally share one guarded
      // model instance and one inference slot in the backend process.
      if (includeFailure) {
        try {
          const snapshot = Object.fromEntries(Object.entries(operationalValues).map(([name, value]) => [name, name === "battery_chemistry" ? value : value.trim() === "" ? null : Number(value)]));
          const failureResponse = await fetch(`${endpoint.replace(/\/$/, "")}/api/predict/failure`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-BatteryAI-Token": token },
            body: JSON.stringify({ snapshot }),
            signal: abortRef.current.signal,
          });
          const data = await failureResponse.json().catch(() => null);
          if (!failureResponse.ok) throw new Error(data?.detail?.message ?? data?.message ?? `HTTP ${failureResponse.status}`);
          if (data?.model_sha256 !== profile.modelSha256 || data?.model_version !== "oxford_ev_failure_v1_full") throw new Error("Analysis service model identity does not match this dashboard.");
          setFailureResult(data as FailureResult); completed += 1;
        } catch (error) { nextErrors.push(`Failure Risk: ${clientErrorMessage(error instanceof Error ? error.message : "")}`); }
      }

      if (includeSoh) {
        try {
          let result: InferenceResponse;
          if (mode === "local") result = await local.infer(rows, abortRef.current.signal);
          else if (mode === "browser") result = await browser.infer(rows, abortRef.current.signal);
          else result = await new AutoInferenceProvider(browser, local, paired).infer(rows, abortRef.current.signal);
          setResponse(result); completed += 1;
        } catch (error) { nextErrors.push(`State of Health: ${clientErrorMessage(error instanceof Error ? error.message : "")}`); }
      }
      setAssessmentErrors(nextErrors);
      setNotice(completed ? `${completed} assessment output${completed === 1 ? "" : "s"} completed.` : "The assessment could not be completed.");
    } finally { setBusy(false); }
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
    setRows([]); setCsvText(""); setResponse(null); setErrors([]); setValidated(false); setNotice("Diagnostic curve data cleared.");
  }

  if (startupError) return <main className="dash-startup"><section className="dash-error"><h1>Re-Li is unavailable</h1><p>{startupError}</p></section></main>;
  if (!config || !profile || !schema) return <main className="dash-startup"><p>Loading Re-Li…</p></main>;

  return <div className="dash">
    <a className="skip-link" href="#overview">Skip to content</a>
    <DashboardSidebar open={navOpen} onClose={closeNav} />
    <div className="dash-main">
      <DashboardHeader connected={paired} busy={busy} completed={!!response || !!failureResult} navOpen={navOpen} onOpenNav={() => setNavOpen(true)} />
      <main className="dash-body">
        <AnalysisPageShell
          eyebrow="Unified battery assessment"
          title="BatteryAI Dashboard"
          description="Provide operational data, diagnostic curve data, or both to evaluate battery health in one coherent assessment."
        >
          <OverviewSection
          completed={!!response || !!failureResult} connected={paired} accessCode={token}
          onAccessCodeChange={(value) => { setToken(value); setPaired(false); }} onConnect={connect}
          rowCount={rows.length} hasOperationalInput={hasOperationalValues(operationalValues)} validated={validated} busy={busy}
        />
        <OperationalInputSection values={operationalValues} onChange={(values) => { setOperationalValues(values); setFailureResult(null); setAssessmentErrors([]); }} />
        <DataInputSection
          tab={tab} onTabChange={setTab} csvText={csvText} onCsvTextChange={setCsvText} onAcceptText={acceptText}
          onUpload={(file) => readCsvFile(file).then(acceptText).catch((error) => setErrors([clientErrorMessage(error instanceof Error ? error.message : "")]))}
          rows={rows} summary={summary} fieldSchema={schema.properties.rows.items.properties} notice={notice}
          onEditRow={editRow} onAddRow={addRow} onValidate={validate} onClear={clear} onLoadExample={loadExample}
        />
        <ValidationSection summary={summary} errors={errors} validated={validated} />
        <UnifiedResultsSection
          busy={busy} hasOperationalInput={hasOperationalValues(operationalValues)} hasDiagnosticInput={rows.length > 0}
          failureResult={failureResult} sohResponse={response} errors={assessmentErrors}
          onRun={runAnalysis} onCancel={() => abortRef.current?.abort()}
          onExportJson={() => download("Re-Li-results.json", JSON.stringify(response, null, 2), "application/json")}
          onExportCsv={() => download("Re-Li-results.csv", resultsToCsv((response?.results ?? []) as unknown as Record<string, unknown>[]), "text/csv")}
        />
          <SuggestionPanel paired={paired} latestResult={response?.results[0] ?? null} provider={suggestionProvider} onStatusChange={setLlmStatus} />
        </AnalysisPageShell>
      </main>
    </div>
  </div>;
}
