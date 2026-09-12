import { keepClientSafe } from "../clientText";
import { AnalysisSection, AnalyzeButton, MetricTile, ModelIdentity, PredictionResultCard } from "../analysis/AnalysisUI";
import type { InferenceResponse, PredictionResult } from "../types";
import { StatusBadge } from "./StatusBadge";

interface ResultsSectionProps {
  connected: boolean;
  busy: boolean;
  rowCount: number;
  response: InferenceResponse | null;
  onRun: () => void;
  onCancel: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
}

export function ResultsSection({ connected, busy, rowCount, response, ...props }: ResultsSectionProps) {
  const results = response?.results ?? [];
  const state = busy ? "Processing" : results.length ? "Completed" : connected ? "Ready" : "Unavailable";

  return <AnalysisSection id="results" eyebrow="Results" title="SOH analysis result" description="Review the estimated state of health together with predictive uncertainty." headerAside={<StatusBadge tone={busy || results.length ? "healthy" : "idle"} label="Status">{state}</StatusBadge>}>

    <div className="dash-actions dash-actions--wrap">
      <AnalyzeButton busy={busy} busyLabel="Analyzing…" onClick={props.onRun} disabled={!rowCount}>Run analysis</AnalyzeButton>
      {busy && <button type="button" className="btn btn--secondary" onClick={props.onCancel}>Cancel</button>}
      {results.length > 0 && <>
        <button type="button" className="btn btn--ghost" onClick={props.onExportJson}>Export JSON</button>
        <button type="button" className="btn btn--ghost" onClick={props.onExportCsv}>Export CSV</button>
      </>}
    </div>

    {busy && <p className="dash-notice" role="status">Analyzing your battery data…</p>}

    {!results.length
      ? <p className="dash-empty">Results appear here once an analysis has completed.</p>
      : <>
        <div className="analysis-result-grid">
          {results.map((result) => {
            const notes = keepClientSafe(result.warnings);
            return <PredictionResultCard key={result.sequence_id}>
              <p className="metric-card__id mono">{result.cell_id} · {result.source_checkpoint} → {result.target_checkpoint}</p>
              <div className="analysis-metric-grid">
                <MetricTile label="Predicted SOH" value={`${result.predicted_soh.toFixed(2)}%`} unit="Estimated state of health" primary />
                <MetricTile label="Predictive uncertainty" value={`±${result.predictive_std.toFixed(2)}%`} unit="Model uncertainty scale" />
              </div>
              <dl className="metric-card__facts">
                <div><dt>From</dt><dd>{result.source_checkpoint}</dd></div>
                <div><dt>To</dt><dd>{result.target_checkpoint}</dd></div>
              </dl>
              <ModelIdentity task="Oxford SOH estimation" modelVersion="oxford_ev_failure_v1_full" modelSha256={result.model_sha256} activeExperts={result.active_experts} />
              {notes.map((note) => <p className="dash-warning" key={note}>{note}</p>)}
            </PredictionResultCard>;
          })}
        </div>
        {results.length > 1 && <SohChart results={results} />}
      </>}
  </AnalysisSection>;
}

function SohChart({ results }: { results: PredictionResult[] }) {
  const values = results.map((result) => result.predicted_soh);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const points = values.map((value, index) => `${20 + index * (560 / Math.max(values.length - 1, 1))},${180 - ((value - min) / span) * 140}`).join(" ");
  return <figure className="chart">
    <figcaption className="chart__caption"><span className="mono chart__title">State of health by sequence</span><span className="chart__unit">%</span></figcaption>
    <svg className="chart__svg chart__svg--volt" viewBox="0 0 600 200" role="img" aria-label={`Predicted state of health for ${results.length} sequences in input order, ranging from ${min.toFixed(2)} to ${max.toFixed(2)} percent.`}>
      <polyline points={points} className="chart__line" />
    </svg>
  </figure>;
}
