import { StatusBadge } from "./StatusBadge";

interface DashboardHeaderProps {
  connected: boolean;
  busy: boolean;
  completed: boolean;
  onOpenNav: () => void;
  navOpen: boolean;
}

export function DashboardHeader({ connected, busy, completed, onOpenNav, navOpen }: DashboardHeaderProps) {
  const analysis = busy ? "Processing" : completed ? "Completed" : connected ? "Ready" : "Unavailable";

  return <header className="dash-header">
    <button type="button" className="dash-header__menu" aria-expanded={navOpen} aria-controls="dashboard-nav" onClick={onOpenNav}>
      <span className="visually-hidden">Open navigation</span>
      <span aria-hidden="true">≡</span>
    </button>
    <h1 className="dash-header__title mono">Re-Li dashboard</h1>
    <div className="dash-header__status">
      <StatusBadge tone={connected ? "healthy" : "warning"} label="Connection">{connected ? "Connected" : "Disconnected"}</StatusBadge>
      <StatusBadge tone={busy || completed ? "healthy" : "idle"} label="Analysis">{analysis}</StatusBadge>
    </div>
  </header>;
}
