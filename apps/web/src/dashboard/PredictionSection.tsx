import type { BackendMode, InferenceResponse, ModelProfile, PredictionResult } from "../types";
import { StatusBadge } from "./StatusBadge";

interface PredictionSectionProps {
  profile: ModelProfile;
  remoteEnabled: boolean;
  mode: BackendMode;
  onModeChange: (mode: BackendMode) => void;
  endpoint: string;
  onEndpointChange: (endpoint: string) => void;
  token: string;
  onTokenChange: (token: string) => void;
  paired: boolean;
  device: string;
  busy: boolean;
  rowCount: number;
  response: InferenceResponse | null;
  onPair: () => void;
  onRun: () => void;
  onCancel: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
}

export function PredictionSection(props: PredictionSectionProps) {
  const { profile, remoteEnabled, mode, endpoint, token, paired, device, busy, rowCount, response } = props;
  const results = response?.results ?? [];

  return <section className="dash-section" id="prediction" aria-labelledby="prediction-heading">
    <div className="dash-section__head">
      <div>
        <p className="eyebrow">Prediction</p>
        <h2 id="prediction-heading">Numerical inference</h2>
      </div>
      <StatusBadge tone={paired ? "healthy" : "warning"} label="Engine">{paired ? "Paired" : "Unpaired"}</StatusBadge>
    </div>

    <div className="backend-grid">
      <div className="field">
        {/* Explicitly associated: a wrapping label would fold the option text into the select's accessible name. */}
        <label className="field__label" htmlFor="backend-mode">Backend</label>
        <select id="backend-mode" value={mode} onChange={(event) => props.onModeChange(event.target.value as BackendMode)}>
          <option value="auto">Auto</option>
          <option value="browser">Browser</option>
          <option value="local">Host computer</option>
        </select>
      </div>
      <label className="field">
        <span className="field__label">{remoteEnabled ? "Configured Funnel backend" : "Local endpoint"}</span>
        <input value={endpoint} readOnly={remoteEnabled} onChange={(event) => props.onEndpointChange(event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Pairing token</span>
        <input type="password" autoComplete="off" value={token} onChange={(event) => props.onTokenChange(event.target.value)} />
      </label>
      <button type="button" className="btn btn--secondary" onClick={props.onPair}>Test &amp; pair host engine</button>
    </div>
    <p className="dash-hint">The backend is shown before pairing. The token stays in sessionStorage for this browser tab only, and no request is made before explicit pairing.</p>

    <div className="dash-actions dash-actions--wrap">
      <button type="button" className="btn" onClick={props.onRun} disabled={busy || !rowCount}>{busy ? "Running…" : "Run prediction"}</button>
      {busy && <button type="button" className="btn btn--secondary" onClick={props.onCancel}>Cancel</button>}
      {results.length > 0 && <>
        <button type="button" className="btn btn--ghost" onClick={props.onExportJson}>Export JSON</button>
        <button type="button" className="btn btn--ghost" onClick={props.onExportCsv}>Export CSV</button>
      </>}
    </div>

    <dl className="matrix matrix--dash">
      <div className="matrix__row"><dt className="mono">Provider</dt><dd>{results[0]?.backend ?? mode}</dd></div>
      <div className="matrix__row"><dt className="mono">Device</dt><dd>{device}</dd></div>
      <div className="matrix__row"><dt className="mono">Checkpoint SHA-256</dt><dd className="mono">{profile.modelSha256.slice(0, 12)}…</dd></div>
    </dl>
    <details className="dash-details">
      <summary>Full checkpoint hash</summary>
      <p className="mono dash-hash">{profile.modelSha256}</p>
    </details>

    {busy && <p className="dash-notice" role="status">Running the Battery-PIMoE checkpoint on the paired host computer…</p>}
    {response?.fallback_occurred && <p className="dash-warning">CUDA was unavailable or out of memory for this run; the host fell back to CPU.</p>}

    {!results.length
      ? <p className="dash-empty">Validated predictions will appear here.</p>
      : <>
        <div className="metric-grid">
          {results.map((result) => <article className="metric-card" key={result.sequence_id}>
            <p className="metric-card__id mono">{result.cell_id} · {result.source_checkpoint} → {result.target_checkpoint}</p>
            <p className="metric-card__value mono">{result.predicted_soh.toFixed(2)}<span className="metric-card__unit">% predicted SOH</span></p>
            <dl className="metric-card__facts">
              <div><dt>Predictive std.</dt><dd>{result.predictive_std.toFixed(2)} pp</dd></div>
              {result.actual_soh != null && <div><dt>Actual SOH</dt><dd>{result.actual_soh.toFixed(2)}%</dd></div>}
              {result.absolute_error != null && <div><dt>Absolute error</dt><dd>{result.absolute_error.toFixed(2)} pp</dd></div>}
              <div><dt>Runtime</dt><dd>{result.timing.total_ms.toFixed(0)} ms</dd></div>
              <div><dt>Backend / device</dt><dd>{result.backend} / {result.runtime_device}</dd></div>
            </dl>
            {result.warnings.map((warning) => <p className="dash-warning" key={warning}>{warning}</p>)}
          </article>)}
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
    <figcaption className="chart__caption"><span className="mono chart__title">Ordered predicted SOH</span><span className="chart__unit">% per sequence</span></figcaption>
    <svg className="chart__svg chart__svg--volt" viewBox="0 0 600 200" role="img" aria-label={`Predicted state of health for ${results.length} sequences in input order, ranging from ${min.toFixed(2)} to ${max.toFixed(2)} percent.`}>
      <polyline points={points} className="chart__line" />
    </svg>
  </figure>;
}
