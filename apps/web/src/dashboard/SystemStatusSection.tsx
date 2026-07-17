import type { AppConfig } from "../config";
import { OLLAMA_MODEL } from "../llm/provider";
import type { LocalLlmStatus } from "../llm/SuggestionPanel";
import type { ModelProfile } from "../types";
import { LimitationsPanel } from "../ui/LimitationsPanel";

interface SystemStatusSectionProps {
  config: AppConfig;
  profile: ModelProfile;
  endpoint: string;
  paired: boolean;
  device: string;
  llmStatus: LocalLlmStatus;
}

export function SystemStatusSection({ config, profile, endpoint, paired, device, llmStatus }: SystemStatusSectionProps) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Deployment mode", value: config.remoteEnabled ? "Remote (configured Tailscale Funnel)" : "Local (loopback)" },
    { label: "Backend endpoint", value: endpoint || "—" },
    { label: "Paired state", value: paired ? "Paired" : "Not paired" },
    { label: "Numerical device", value: paired ? device : "Unknown until paired" },
    { label: "Model profile", value: `${profile.title} (${profile.id})` },
    { label: "Ollama endpoint", value: "Loopback on the host computer only; the browser never contacts it" },
    { label: "Ollama model", value: OLLAMA_MODEL },
    { label: "Ollama readiness", value: llmStatus },
    { label: "Browser ONNX", value: "Unavailable for Oxford V1" },
    { label: "Remaining useful life", value: "Unavailable" },
  ];

  return <section className="dash-section" id="system-status" aria-labelledby="system-status-heading">
    <div className="dash-section__head">
      <div>
        <p className="eyebrow">System status</p>
        <h2 id="system-status-heading">Configuration and capabilities</h2>
      </div>
    </div>

    <dl className="matrix matrix--dash">
      {rows.map((row) => <div className="matrix__row" key={row.label}>
        <dt className="mono">{row.label}</dt>
        <dd>{row.value}</dd>
      </div>)}
      <div className="matrix__row">
        <dt className="mono">Checkpoint SHA-256</dt>
        <dd className="mono dash-hash">{profile.modelSha256}</dd>
      </div>
    </dl>

    <p className="dash-warning">
      Inference runs on the host computer, not on GitHub Pages. Remote use requires that host to remain online and the paired service to stay reachable.
    </p>

    <h3 className="dash-subtitle mono">Limitations</h3>
    <LimitationsPanel profile={profile} />
  </section>;
}
