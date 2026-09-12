import { contactPath, dashboardPath, landingPath } from "../routes";

export const RELI_SUPPORT_EMAIL = "support.reli@gmail.com";
export const RELI_SUPPORT_MAILTO = `mailto:${RELI_SUPPORT_EMAIL}?subject=Re-Li%20Inquiry`;

export function LandingFooter() {
  return <footer className="landing-footer">
    <div className="landing-footer__inner">
      <nav aria-label="Footer">
        <ul className="landing-footer__links mono">
          <li><a href={landingPath()}>Re-Li</a></li>
          <li><a href={dashboardPath()}>Dashboard</a></li>
          <li><a href={contactPath()}>Contact</a></li>
          <li><a href={RELI_SUPPORT_MAILTO}>{RELI_SUPPORT_EMAIL}</a></li>
        </ul>
      </nav>
      <p className="mono landing-footer__note">© {new Date().getFullYear()} Re-Li</p>
    </div>
  </footer>;
}
