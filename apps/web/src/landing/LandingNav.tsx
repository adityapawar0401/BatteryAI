import { useCallback, useState } from "react";
import { dashboardPath, landingPath } from "../routes";
import { useOverlayDismiss } from "../ui/useOverlayDismiss";

export const landingSections = [
  { id: "product", label: "Product" },
  { id: "how-it-works", label: "How it works" },
  { id: "benefits", label: "Benefits" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useOverlayDismiss(open, close);

  return <nav className="landing-nav" aria-label="Primary">
    <div className="landing-nav__bar">
      <a className="landing-nav__brand mono" href={landingPath()}><span className="landing-nav__mark" aria-hidden="true" />Re-Li</a>
      <ul className="landing-nav__links mono">
        {landingSections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.label}</a></li>)}
      </ul>
      <a className="btn landing-nav__cta" href={dashboardPath()}>Open Dashboard</a>
      <button type="button" className="landing-nav__toggle" aria-expanded={open} aria-controls="landing-menu" onClick={() => setOpen((value) => !value)}>
        <span className="visually-hidden">{open ? "Close menu" : "Open menu"}</span>
        <span className="landing-nav__bars" aria-hidden="true" />
      </button>
    </div>
    <div id="landing-menu" className={`landing-nav__menu${open ? " landing-nav__menu--open" : ""}`} hidden={!open}>
      <ul className="mono">
        {landingSections.map((section) => <li key={section.id}><a href={`#${section.id}`} onClick={close}>{section.label}</a></li>)}
        <li><a href={dashboardPath()} onClick={close}>Dashboard</a></li>
      </ul>
    </div>
  </nav>;
}
