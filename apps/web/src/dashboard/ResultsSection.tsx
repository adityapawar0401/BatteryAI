import { keepClientSafe } from "../clientText";
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

  return <section className="dash-section" id="results" aria-labelledby="results-heading">
    <div className="dash-section__head">
      <div>
        <p className="eyebrow">Results</p>
        <h2 id="results-heading">Analysis results</h2>
      </div>
      <StatusBadge tone={busy || results.length ? "healthy" : "idle"} label="Status">{state}</StatusBadge>
    </div>

    <div className="dash-actions dash-actions--wrap">
      <button type="button" className="btn" onClick={props.onRun} disabled={busy || !rowCount}>{busy ? "Analyzing…" : "Run analysis"}</button>
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
        <div className="metric-grid">
          {results.map((result) => {
            const notes = keepClientSafe(result.warnings);
            return <article className="metric-card" key={result.sequence_id}>
              <p className="metric-card__id mono">{result.cell_id} · {result.source_checkpoint} → {result.target_checkpoint}</p>
              <p className="metric-card__value mono">{result.predicted_soh.toFixed(2)}<span className="metric-card__unit">% predicted state of health</span></p>
              <dl className="metric-card__facts">
                <div><dt>Uncertainty</dt><dd>± {result.predictive_std.toFixed(2)} pp</dd></div>
                {result.actual_soh != null && <div><dt>Reference SOH</dt><dd>{result.actual_soh.toFixed(2)}%</dd></div>}
                {result.absolute_error != null && <div><dt>Absolute error</dt><dd>{result.absolute_error.toFixed(2)} pp</dd></div>}
                <div><dt>From</dt><dd>{result.source_checkpoint}</dd></div>
                <div><dt>To</dt><dd>{result.target_checkpoint}</dd></div>
              </dl>
              {notes.map((note) => <p className="dash-warning" key={note}>{note}</p>)}
            </article>;
          })}
        </div>
        {results.length > 1 && <SohChart results={results} />}
      </>}
  </section>;
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
