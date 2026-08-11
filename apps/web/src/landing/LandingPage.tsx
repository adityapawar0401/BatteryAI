import { dashboardPath } from "../routes";
import { CursorHalo } from "./CursorHalo";
import { LandingFooter } from "./LandingFooter";
import { LandingNav } from "./LandingNav";
import { NeuralBackdrop } from "./NeuralBackdrop";
import { Reveal } from "./Reveal";
import "../styles/tokens.css";
import "../styles/components.css";
import "../styles/landing.css";

const value = [
  { index: "01", title: "Battery health analysis", body: "Estimate battery state of health from structured charge-cycle data." },
  { index: "02", title: "Clear results", body: "Review the estimated state of health in a focused customer-facing result." },
  { index: "03", title: "Actionable insights", body: "Turn a completed analysis into concise recommended actions and considerations." },
  { index: "04", title: "Structured workflow", body: "Upload, validate, analyze, and review results in one interface." },
];

const steps = [
  { step: "01", title: "Upload battery data", body: "Bring your own charge-cycle data as a CSV, paste it directly, or start from the example dataset." },
  { step: "02", title: "Validate the dataset", body: "Every row is checked against the expected format before anything is analyzed." },
  { step: "03", title: "Run the analysis", body: "Start the health analysis and follow its progress." },
  { step: "04", title: "Review results and insights", body: "Read the estimated state of health, then generate practical usage guidance." },
];

const benefits = [
  "Clear analysis workflow",
  "Structured data validation",
  "Fast result review",
  "Prediction uncertainty on every estimate",
  "Optional reference comparison",
  "Actionable insight generation",
  "Secure access-controlled analysis",
];

export function LandingPage() {
  return <div className="landing">
    <NeuralBackdrop />
    <CursorHalo />
    <a className="skip-link" href="#main">Skip to content</a>
    <LandingNav />

    <main id="main">
      <header className="landing-hero">
        <div className="landing-hero__glow" aria-hidden="true" />
        <div className="landing-hero__inner">
          <p className="eyebrow">Battery health intelligence</p>
          <h1 className="landing-hero__title mono">BatteryAI</h1>
          <p className="landing-hero__tagline">Battery intelligence for confident decisions.</p>
          <div className="landing-hero__body">
            <p className="landing-hero__lede">
              Upload battery test data, run a health analysis, and review clear, actionable insights in one streamlined workspace.
            </p>
            <ul className="landing-hero__spec mono">
              <li>[01] State of health</li>
              <li>[02] Prediction uncertainty</li>
              <li>[03] Written insights</li>
            </ul>
          </div>
          <div className="landing-hero__actions">
            <a className="btn" href={dashboardPath()}>Open Dashboard</a>
            <a className="btn btn--secondary" href="#how-it-works">See How It Works</a>
          </div>
        </div>
      </header>

      <section className="landing-section" id="product" aria-labelledby="product-heading">
        <div className="landing-section__inner">
          <Reveal className="landing-section__head">
            <p className="eyebrow eyebrow--copper">/ 001</p>
            <h2 id="product-heading" className="landing-section__title mono">What you get.</h2>
          </Reveal>
          <div className="landing-grid landing-grid--cards">
            {value.map((item) => <Reveal as="article" className="panel panel--card" key={item.index}>
              <p className="panel__index mono" aria-hidden="true">{item.index}</p>
              <h3 className="panel__title">{item.title}</h3>
              <p className="panel__body">{item.body}</p>
            </Reveal>)}
          </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works" aria-labelledby="how-it-works-heading">
        <div className="landing-section__inner">
          <Reveal className="landing-section__head">
            <p className="eyebrow eyebrow--copper">/ 002</p>
            <h2 id="how-it-works-heading" className="landing-section__title mono">How it works.</h2>
          </Reveal>
          <ol className="landing-chain">
            {steps.map((item) => <Reveal as="li" className="landing-chain__item" key={item.step}>
              <div className="panel panel--chain">
                <p className="panel__index mono" aria-hidden="true">{item.step}</p>
                <h3 className="panel__title">{item.title}</h3>
                <p className="panel__body">{item.body}</p>
              </div>
            </Reveal>)}
          </ol>
        </div>
      </section>

      <section className="landing-section landing-section--limits" id="benefits" aria-labelledby="benefits-heading">
        <div className="landing-section__inner">
          <Reveal className="landing-section__head">
            <p className="eyebrow eyebrow--copper">/ 003</p>
            <h2 id="benefits-heading" className="landing-section__title mono">Built for review.</h2>
          </Reveal>
          <Reveal className="panel">
            <ul className="fact-list fact-list--columns">{benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
          </Reveal>
          <Reveal className="landing-cta">
            <p className="landing-cta__text">Run your first battery health analysis.</p>
            <a className="btn" href={dashboardPath()}>Open Dashboard</a>
          </Reveal>
        </div>
      </section>
    </main>

    <LandingFooter />
  </div>;
}
