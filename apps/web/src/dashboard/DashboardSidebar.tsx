import { landingPath } from "../routes";
import { useOverlayDismiss } from "../ui/useOverlayDismiss";

export const dashboardSections = [
  { id: "overview", label: "Overview", glyph: "◈" },
  { id: "data", label: "Data", glyph: "▣" },
  { id: "validation", label: "Validation", glyph: "⟁" },
  { id: "results", label: "Results", glyph: "∿" },
  { id: "insights", label: "Insights", glyph: "✦" },
];

interface DashboardSidebarProps { open: boolean; onClose: () => void }

export function DashboardSidebar({ open, onClose }: DashboardSidebarProps) {
  useOverlayDismiss(open, onClose);

  return <>
    {open && <button type="button" className="dash-sidebar__scrim" aria-label="Close navigation" onClick={onClose} />}
    <aside id="dashboard-nav" className={`dash-sidebar${open ? " dash-sidebar--open" : ""}`}>
      <div className="dash-sidebar__brand">
        <a className="mono dash-sidebar__logo" href={landingPath()}><span className="dash-sidebar__mark" aria-hidden="true" />Re-Li</a>
      </div>
      <nav className="dash-sidebar__nav mono" aria-label="Dashboard sections">
        <ul>
          {dashboardSections.map((section) => <li key={section.id}>
            <a href={`#${section.id}`} onClick={onClose}><span aria-hidden="true">{section.glyph}</span>{section.label}</a>
          </li>)}
        </ul>
      </nav>
      <div className="dash-sidebar__foot">
        <a className="mono dash-sidebar__back" href={landingPath()} onClick={onClose}>← Back to landing page</a>
      </div>
    </aside>
  </>;
}
