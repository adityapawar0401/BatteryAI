import { dashboardPath } from "../routes";

export function LandingFooter() {
  return <footer className="landing-footer">
    <div className="landing-footer__inner">
      <nav aria-label="Footer">
        <ul className="landing-footer__links mono">
          <li><a href={dashboardPath()}>Dashboard</a></li>
          <li><a href="#architecture">Architecture</a></li>
          <li><a href="#limitations">Limitations</a></li>
        </ul>
      </nav>
      <p className="mono landing-footer__note">© {new Date().getFullYear()} BatteryAI · Self-hosted numerical inference · No account, sign-in, or cloud LLM API</p>
    </div>
  </footer>;
}
