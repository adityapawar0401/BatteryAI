import type { ReactNode } from "react";

const expertLabels: Record<string, string> = {
  core_operational: "Core operational",
  diagnostic_curve: "Diagnostic curve",
  usage_aging: "Usage / aging",
  chemistry_geometry: "Chemistry",
  pack_context: "Pack context",
  physics_state: "Physics state",
  residual: "Residual",
};

interface AnalysisPageShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function AnalysisPageShell({ eyebrow, title, description, children }: AnalysisPageShellProps) {
  return <div className="analysis-page" data-analysis-shell="BatteryAI">
    <div className="analysis-page__header">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mono">{title}</h1>
      <p>{description}</p>
    </div>
    {children}
  </div>;
}

interface AnalysisSectionProps {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  headerAside?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function AnalysisSection({ id, eyebrow, title, description, headerAside, className = "", children }: AnalysisSectionProps) {
  const headingId = `${id}-heading`;
  return <section className={`analysis-card ${className}`.trim()} id={id} aria-labelledby={headingId}>
    <div className="analysis-card__head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={headingId}>{title}</h2>
        {description && <p className="analysis-card__intro">{description}</p>}
      </div>
      {headerAside}
    </div>
    {children}
  </section>;
}

interface AnalyzeButtonProps {
  busy: boolean;
  children: ReactNode;
  busyLabel: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}

export function AnalyzeButton({ busy, children, busyLabel, disabled, onClick, type = "button" }: AnalyzeButtonProps) {
  return <button type={type} className="btn analysis-button" disabled={busy || disabled} onClick={onClick} aria-busy={busy}>
    {busy ? busyLabel : children}
  </button>;
}

export function AnalysisError({ children }: { children: ReactNode }) {
  return <div className="analysis-error" role="alert"><strong>Needs attention</strong><div>{children}</div></div>;
}

export function PredictionResultCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <article className={`analysis-result-card ${className}`.trim()} aria-live="polite">{children}</article>;
}

interface MetricTileProps {
  label: string;
  value: string;
  unit?: string;
  primary?: boolean;
}

export function MetricTile({ label, value, unit, primary = false }: MetricTileProps) {
  return <div className={`analysis-metric${primary ? " analysis-metric--primary" : ""}`}>
    <p className="analysis-metric__label mono">{label}</p>
    <p className="analysis-metric__value mono">{value}</p>
    {unit && <p className="analysis-metric__unit">{unit}</p>}
  </div>;
}

interface ModelIdentityProps {
  task: string;
  modelVersion: string;
  modelSha256: string;
  activeExperts: string[];
}

export function ModelIdentity({ task, modelVersion, modelSha256, activeExperts }: ModelIdentityProps) {
  return <details className="analysis-model">
    <summary>Model details</summary>
    <div className="analysis-model__body">
      <p className="analysis-model__name mono">Battery-PIMoE</p>
      <p className="analysis-model__version">Oxford + EV Failure descendant</p>
      <dl className="matrix analysis-model__facts">
        <div className="matrix__row"><dt>Task</dt><dd>{task}</dd></div>
        <div className="matrix__row"><dt>Version</dt><dd className="mono">{modelVersion}</dd></div>
        <div className="matrix__row"><dt>Model ID</dt><dd className="mono">{modelSha256.slice(0, 12)}</dd></div>
      </dl>
      <p className="analysis-model__label mono">Active experts</p>
      <ul className="chips">
        {activeExperts.map((expert) => <li className="chip" key={expert}>{expertLabels[expert] ?? expert}</li>)}
      </ul>
    </div>
  </details>;
}
