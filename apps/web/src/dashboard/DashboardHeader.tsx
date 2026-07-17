import type { LocalLlmStatus } from "../llm/SuggestionPanel";
import { StatusBadge, type StatusTone } from "./StatusBadge";

interface DashboardHeaderProps {
  remoteEnabled: boolean;
  endpoint: string;
  paired: boolean;
  device: string;
  llmStatus: LocalLlmStatus;
  onOpenNav: () => void;
  navOpen: boolean;
}

const llmTone: Record<LocalLlmStatus, StatusTone> = { unavailable: "idle", checking: "idle", ready: "healthy", generating: "healthy", completed: "healthy", error: "warning" };

export function DashboardHeader({ remoteEnabled, endpoint, paired, device, llmStatus, onOpenNav, navOpen }: DashboardHeaderProps) {
  return <header className="dash-header">
    <button type="button" className="dash-header__menu" aria-expanded={navOpen} aria-controls="dashboard-nav" onClick={onOpenNav}>
      <span className="visually-hidden">Open navigation</span>
      <span aria-hidden="true">≡</span>
    </button>
    <h1 className="dash-header__title mono">BatteryAI dashboard</h1>
    <div className="dash-header__status">
      <StatusBadge tone="idle" label="Mode">{remoteEnabled ? "Remote" : "Local"}</StatusBadge>
      {/* Too narrow to read on mobile; System Status and the prediction form show the endpoint in full. */}
      <StatusBadge tone="idle" label="Backend" className="status-badge--endpoint">{endpoint || "—"}</StatusBadge>
      <StatusBadge tone={paired ? "healthy" : "warning"} label="Service">{paired ? "Paired" : "Unpaired"}</StatusBadge>
      {paired && <StatusBadge tone="healthy" label="Device">{device}</StatusBadge>}
      {paired && <StatusBadge tone={llmTone[llmStatus]} label="Ollama">{llmStatus}</StatusBadge>}
    </div>
  </header>;
}
