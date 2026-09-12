import { StatusBadge } from "./StatusBadge";
import { AnalysisError, AnalysisSection } from "../analysis/AnalysisUI";
import { listOrDash, type DatasetSummary } from "./summary";

interface ValidationSectionProps {
  summary: DatasetSummary | null;
  errors: string[];
  validated: boolean;
}

export function ValidationSection({ summary, errors, validated }: ValidationSectionProps) {
  const tone = errors.length ? "warning" : validated ? "healthy" : "idle";
  const state = errors.length ? "Problems found" : validated ? "Validation passed" : "Validation required";

  return <AnalysisSection id="validation" eyebrow="Diagnostic validation" title="Diagnostic data validation" description="Validation confirms that supplied diagnostic curve data is complete and structured correctly before analysis." headerAside={<StatusBadge tone={tone} label="Status">{state}</StatusBadge>}>

    {!summary
      ? <p className="dash-empty">Add battery data to see what the dataset contains.</p>
      : <dl className="matrix matrix--dash">
        <div className="matrix__row"><dt className="mono">Rows</dt><dd>{summary.rowCount.toLocaleString()}</dd></div>
        <div className="matrix__row"><dt className="mono">Sequences</dt><dd>{listOrDash(summary.sequences)}</dd></div>
        <div className="matrix__row"><dt className="mono">Cells</dt><dd>{listOrDash(summary.cells)}</dd></div>
        <div className="matrix__row"><dt className="mono">Modality</dt><dd>{listOrDash(summary.modalities)}</dd></div>
        <div className="matrix__row"><dt className="mono">Source checkpoint</dt><dd>{listOrDash(summary.sourceCheckpoints)}</dd></div>
        <div className="matrix__row"><dt className="mono">Target checkpoint</dt><dd>{listOrDash(summary.targetCheckpoints)}</dd></div>
      </dl>}

    {errors.length > 0 && <AnalysisError><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></AnalysisError>}
  </AnalysisSection>;
}
