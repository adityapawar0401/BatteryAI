import type { InferenceResponse } from "../types";
import { ConnectionPanel } from "./ConnectionPanel";
import { StatusBadge, type StatusTone } from "./StatusBadge";

interface OverviewSectionProps {
  response: InferenceResponse | null;
  connected: boolean;
  accessCode: string;
  onAccessCodeChange: (value: string) => void;
  onConnect: () => void;
  rowCount: number;
  validated: boolean;
  busy: boolean;
}

type StepState = { label: string; state: string; tone: StatusTone };

export function OverviewSection(props: OverviewSectionProps) {
  const { response, connected, rowCount, validated, busy } = props;
  const result = response?.results[0] ?? null;

  const steps: StepState[] = [
    { label: "Connection", state: connected ? "Connected" : "Disconnected", tone: connected ? "healthy" : "warning" },
    { label: "Battery data", state: rowCount ? `${rowCount.toLocaleString()} rows added` : "No data yet", tone: rowCount ? "healthy" : "idle" },
    { label: "Validation", state: validated ? "Validation passed" : rowCount ? "Validation required" : "Waiting for data", tone: validated ? "healthy" : rowCount ? "warning" : "idle" },
    { label: "Analysis", state: busy ? "Processing" : response ? "Completed" : connected && validated ? "Ready" : "Not ready", tone: response || busy ? "healthy" : "idle" },
  ];

  const nextAction = !connected
    ? "Connect with your access code to begin."
    : !rowCount
      ? "Add battery data to analyze."
      : !validated
        ? "Validate your data before running the analysis."
        : !response
          ? "Everything is ready. Run the analysis."
          : "Generate insights for this result, or analyze another dataset.";

  return <section className="dash-section" id="overview" aria-labelledby="overview-heading">
    <div className="dash-section__head">
      <div>
        <p className="eyebrow">Overview</p>
        <h2 id="overview-heading">Battery health analysis</h2>
      </div>
    </div>

    <ConnectionPanel connected={connected} accessCode={props.accessCode} onAccessCodeChange={props.onAccessCodeChange} onConnect={props.onConnect} />

    <h3 className="dash-subtitle mono">Progress</h3>
    <ul className="progress-list">
      {steps.map((step) => <li className="progress-list__item" key={step.label}>
        <span className="progress-list__label mono">{step.label}</span>
        <StatusBadge tone={step.tone} label="">{step.state}</StatusBadge>
      </li>)}
    </ul>
    <p className="dash-notice" role="status">{nextAction}</p>

    {result && <>
      <h3 className="dash-subtitle mono">Latest result</h3>
      <div className="metric-grid">
        <article className="metric-card">
          <p className="metric-card__id mono">{result.cell_id} · {result.source_checkpoint} → {result.target_checkpoint}</p>
          <p className="metric-card__value mono">{result.predicted_soh.toFixed(2)}<span className="metric-card__unit">% estimated state of health</span></p>
        </article>
      </div>
    </>}
  </section>;
}
