import type { ModelProfile } from "../types";

/** Deployment-level limitations that sit outside the model profile's own list. */
export const deploymentLimitations = [
  "Predictions are decision support, not a safety certification.",
  "Synthetic CSV examples exercise the pipeline; they are not evidence of model performance.",
  "The supplied Oxford fixture comes from the checkpoint's own training cells, so it is not an unbiased evaluation set.",
  "Remote use depends on the host computer staying online; GitHub Pages cannot run the model on its own.",
];

export function LimitationsPanel({ profile, className = "" }: { profile: ModelProfile; className?: string }) {
  return <div className={`limitations${className ? ` ${className}` : ""}`}>
    <div>
      <h3 className="mono limitations__title">Model</h3>
      <ul className="limitations__list">{profile.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
    <div>
      <h3 className="mono limitations__title">Deployment</h3>
      <ul className="limitations__list">{deploymentLimitations.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  </div>;
}
