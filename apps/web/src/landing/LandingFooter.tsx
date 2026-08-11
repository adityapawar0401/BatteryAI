import { dashboardPath } from "../routes";

export function LandingFooter() {
  return <footer className="landing-footer">
    <div className="landing-footer__inner">
      <nav aria-label="Footer">
        <ul className="landing-footer__links mono">
          <li><a href={dashboardPath()}>Dashboard</a></li>
          <li><a href="#how-it-works">How it works</a></li>
        </ul>
      </nav>
      <p className="mono landing-footer__note">© {new Date().getFullYear()} Re-Li</p>
    </div>
  </footer>;
}
