import type { InferenceResponse, ModelProfile } from "../types";

const workflow = [
  { step: "01", title: "Pair the service", body: "Enter your BatteryAI endpoint and the pairing token it printed at startup, then pair. Nothing is sent before you do." },
  { step: "02", title: "Provide curve data", body: "Upload a CSV, paste rows, load the supplied example, or edit the table directly." },
  { step: "03", title: "Validate", body: "Check the rows against the canonical Oxford field contract." },
  { step: "04", title: "Run the prediction", body: "The paired host computer runs the Battery-PIMoE checkpoint on CUDA or CPU." },
  { step: "05", title: "Interpret (optional)", body: "Ask the host's local Ollama model to read the completed prediction back in plain language." },
];

export function OverviewSection({ response, profile }: { response: InferenceResponse | null; profile: ModelProfile }) {
  const results = response?.results ?? [];

  return <section className="dash-section" id="overview" aria-labelledby="overview-heading">
    <div className="dash-section__head">
      <div>
        <p className="eyebrow">Overview</p>
        <h2 id="overview-heading">Prediction summary</h2>
      </div>
    </div>

    {!results.length
      ? <>
        <p className="dash-empty">No prediction yet. Results appear here once a validated dataset has been run on the paired service.</p>
        <ol className="workflow">
          {workflow.map((item) => <li className="workflow__item" key={item.step}>
            <p className="workflow__step mono" aria-hidden="true">{item.step}</p>
            <h3 className="workflow__title">{item.title}</h3>
            <p className="workflow__body">{item.body}</p>
          </li>)}
        </ol>
      </>
      : <div className="metric-grid">
        {results.map((result) => <article className="metric-card" key={result.sequence_id}>
          <p className="metric-card__id mono">{result.cell_id} · {result.source_checkpoint} → {result.target_checkpoint}</p>
          <p className="metric-card__value mono">{result.predicted_soh.toFixed(2)}<span className="metric-card__unit">% predicted SOH</span></p>
          <dl className="metric-card__facts">
            <div><dt>Predictive std.</dt><dd>{result.predictive_std.toFixed(2)} pp</dd></div>
            {result.actual_soh != null && <div><dt>Actual SOH</dt><dd>{result.actual_soh.toFixed(2)}%</dd></div>}
            {result.absolute_error != null && <div><dt>Absolute error</dt><dd>{result.absolute_error.toFixed(2)} pp</dd></div>}
            <div><dt>Device used</dt><dd>{result.runtime_device}</dd></div>
            <div><dt>Model profile</dt><dd>{profile.title}</dd></div>
            <div><dt>Sequence</dt><dd>{result.sequence_id}</dd></div>
          </dl>
        </article>)}
      </div>}
  </section>;
}
