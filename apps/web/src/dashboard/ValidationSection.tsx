import { StatusBadge } from "./StatusBadge";
import { listOrDash, type DatasetSummary } from "./summary";

interface ValidationSectionProps {
  summary: DatasetSummary | null;
  errors: string[];
  validated: boolean;
}

export function ValidationSection({ summary, errors, validated }: ValidationSectionProps) {
  const tone = errors.length ? "warning" : validated ? "healthy" : "idle";
  const state = errors.length ? "Problems found" : validated ? "Validation passed" : "Validation required";

  return <section className="dash-section" id="validation" aria-labelledby="validation-heading">
    <div className="dash-section__head">
      <div>
        <p className="eyebrow">Validation</p>
        <h2 id="validation-heading">Data validation</h2>
      </div>
      <StatusBadge tone={tone} label="Status">{state}</StatusBadge>
    </div>

    {!summary
      ? <p className="dash-empty">Add battery data to see what the dataset contains.</p>
      : <dl className="matrix matrix--dash">
        <div className="matrix__row"><dt className="mono">Rows</dt><dd>{summary.rowCount.toLocaleString()}</dd></div>
        <div className="matrix__row"><dt className="mono">Sequences</dt><dd>{listOrDash(summary.sequences)}</dd></div>
        <div className="matrix__row"><dt className="mono">Cells</dt><dd>{listOrDash(summary.cells)}</dd></div>
        <div className="matrix__row"><dt className="mono">Modality</dt><dd>{listOrDash(summary.modalities)}</dd></div>
        <div className="matrix__row"><dt className="mono">Source checkpoint</dt><dd>{listOrDash(summary.sourceCheckpoints)}</dd></div>
        <div className="matrix__row"><dt className="mono">Target checkpoint</dt><dd>{listOrDash(summary.targetCheckpoints)}</dd></div>
        <div className="matrix__row"><dt className="mono">Reference SOH supplied</dt><dd>{summary.actualSohSupplied ? "Yes" : "No"}</dd></div>
      </dl>}

    {errors.length > 0 && <div className="dash-error" role="alert">
      <strong>Needs attention</strong>
      <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
    </div>}
  </section>;
}
