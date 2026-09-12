import { AnalysisError, AnalysisSection, AnalyzeButton, MetricTile, ModelIdentity, PredictionResultCard } from "../analysis/AnalysisUI";
import { keepClientSafe } from "../clientText";
import type { FailureResult, InferenceResponse } from "../types";
import { StatusBadge } from "./StatusBadge";

interface UnifiedResultsSectionProps {
  busy: boolean;
  hasOperationalInput: boolean;
  hasDiagnosticInput: boolean;
  failureResult: FailureResult | null;
  sohResponse: InferenceResponse | null;
  errors: string[];
  onRun: () => void;
  onCancel: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
}

export function UnifiedResultsSection(props: UnifiedResultsSectionProps) {
  const soh = props.sohResponse?.results[0] ?? null;
  const completed = Boolean(props.failureResult || soh);
  const state = props.busy ? "Processing" : completed ? "Completed" : "Ready";

  return <AnalysisSection id="assessment" eyebrow="Assessment" title="Battery Health Assessment" description="One assessment presents every output supported by the input data you supplied." headerAside={<StatusBadge tone={props.busy || completed ? "healthy" : "idle"} label="Status">{state}</StatusBadge>}>
    <div className="dash-actions dash-actions--wrap">
      <AnalyzeButton busy={props.busy} busyLabel="Analyzing…" onClick={props.onRun} disabled={!props.hasOperationalInput && !props.hasDiagnosticInput}>Analyze battery</AnalyzeButton>
      {props.busy && <button type="button" className="btn btn--secondary" onClick={props.onCancel}>Cancel</button>}
      {props.sohResponse && <>
        <button type="button" className="btn btn--ghost" onClick={props.onExportJson}>Export JSON</button>
        <button type="button" className="btn btn--ghost" onClick={props.onExportCsv}>Export CSV</button>
      </>}
    </div>

    {props.busy && <p className="dash-notice" role="status">Analyzing your battery data…</p>}
    {props.errors.length > 0 && <AnalysisError><ul>{props.errors.map((error) => <li key={error}>{error}</li>)}</ul></AnalysisError>}

    <div className="unified-assessment">
      <PredictionResultCard className="assessment-output">
        <p className="eyebrow">State of Health</p>
        {soh ? <>
          <div className="analysis-metric-grid">
            <MetricTile label="Predicted SOH" value={`${soh.predicted_soh.toFixed(2)}%`} unit="Estimated state of health" primary />
            <MetricTile label="SOH uncertainty" value={`±${soh.predictive_std.toFixed(2)}%`} unit="Predictive uncertainty scale" />
          </div>
          <p className="metric-card__id mono">{soh.cell_id} · {soh.source_checkpoint} → {soh.target_checkpoint}</p>
          {keepClientSafe(soh.warnings).map((warning) => <p className="dash-warning" key={warning}>{warning}</p>)}
        </> : <NeutralResult supplied={props.hasDiagnosticInput} label="State of Health" />}
      </PredictionResultCard>

      <PredictionResultCard className="assessment-output">
        <p className="eyebrow">Failure Risk</p>
        {props.failureResult ? <>
          <div className="analysis-metric-grid">
            <MetricTile label="Failure probability" value={`${(props.failureResult.failure_probability * 100).toFixed(1)}%`} unit="Snapshot classification probability" primary />
            <MetricTile label="Status" value={props.failureResult.failure_flag ? "Failure flag" : "No failure flag"} unit="Based on the production threshold" />
            <MetricTile label="Threshold" value={`${(props.failureResult.decision_threshold * 100).toFixed(1)}%`} unit="Production classification cutoff" />
          </div>
          <div className="failure-meter" aria-label={`Failure probability ${(props.failureResult.failure_probability * 100).toFixed(1)} percent`}><span style={{ width: `${props.failureResult.failure_probability * 100}%` }} /></div>
        </> : <NeutralResult supplied={props.hasOperationalInput} label="Failure Risk" />}
      </PredictionResultCard>
    </div>

    <div className="assessment-interpretation">
      <h3>Interpretation</h3>
      <p>Review State of Health with its uncertainty and Failure Risk with its stored threshold. Failure Risk is a snapshot classification; it does not predict when a failure could occur or certify the battery as safe.</p>
    </div>
    <ModelIdentity />
  </AnalysisSection>;
}

function NeutralResult({ supplied, label }: { supplied: boolean; label: string }) {
  return <div className="assessment-neutral">
    <strong>{supplied ? "Awaiting analysis" : "Not evaluated"}</strong>
    <p>{supplied ? `${label} inputs are ready to analyze.` : `No ${label.toLowerCase()} input was supplied.`}</p>
  </div>;
}
