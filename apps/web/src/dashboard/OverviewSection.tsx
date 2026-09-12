import { AnalysisSection } from "../analysis/AnalysisUI";
import { ConnectionPanel } from "./ConnectionPanel";
import { StatusBadge, type StatusTone } from "./StatusBadge";

interface OverviewSectionProps {
  completed: boolean;
  connected: boolean;
  accessCode: string;
  onAccessCodeChange: (value: string) => void;
  onConnect: () => void;
  rowCount: number;
  hasOperationalInput: boolean;
  validated: boolean;
  busy: boolean;
}

type StepState = { label: string; state: string; tone: StatusTone };

export function OverviewSection(props: OverviewSectionProps) {
  const { completed, connected, rowCount, hasOperationalInput, validated, busy } = props;
  const hasInput = hasOperationalInput || rowCount > 0;

  const steps: StepState[] = [
    { label: "Connection", state: connected ? "Connected" : "Disconnected", tone: connected ? "healthy" : "warning" },
    { label: "Battery data", state: hasInput ? "Input available" : "No data yet", tone: hasInput ? "healthy" : "idle" },
    { label: "Diagnostic validation", state: !rowCount ? "Not required" : validated ? "Validation passed" : "Validation required", tone: !rowCount || validated ? "healthy" : "warning" },
    { label: "Assessment", state: busy ? "Processing" : completed ? "Completed" : connected && hasInput ? "Ready" : "Not ready", tone: completed || busy ? "healthy" : "idle" },
  ];

  const nextAction = !connected
    ? "Connect with your access code to begin."
    : !hasInput
      ? "Add battery data to analyze."
      : rowCount > 0 && !validated
        ? "Validate your data before running the analysis."
        : !completed
          ? "Everything is ready. Run the analysis."
          : "Generate insights for this result, or analyze another dataset.";

  return <AnalysisSection id="overview" eyebrow="Overview" title="Battery health assessment" description="Connect securely, add either supported input workflow, and run one unified assessment.">

    <ConnectionPanel connected={connected} accessCode={props.accessCode} onAccessCodeChange={props.onAccessCodeChange} onConnect={props.onConnect} />

    <h3 className="dash-subtitle mono">Progress</h3>
    <ul className="progress-list">
      {steps.map((step) => <li className="progress-list__item" key={step.label}>
        <span className="progress-list__label mono">{step.label}</span>
        <StatusBadge tone={step.tone} label="">{step.state}</StatusBadge>
      </li>)}
    </ul>
    <p className="dash-notice" role="status">{nextAction}</p>
  </AnalysisSection>;
}
