import type { ReactNode } from "react";

export type StatusTone = "healthy" | "warning" | "idle";

export function StatusBadge({ tone, label, children, className = "" }: { tone: StatusTone; label: string; children?: ReactNode; className?: string }) {
  return <span className={`status-badge status-badge--${tone} mono${className ? ` ${className}` : ""}`}>
    <span className="status-badge__dot" aria-hidden="true" />
    <span className="status-badge__label">{label}</span>
    {children != null && <b className="status-badge__value">{children}</b>}
  </span>;
}
