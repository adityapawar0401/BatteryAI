import { contactPath, dashboardPath } from "../routes";
import { CursorHalo } from "./CursorHalo";
import { LandingFooter } from "./LandingFooter";
import { LandingNav } from "./LandingNav";
import { NeuralBackdrop } from "./NeuralBackdrop";
import { Reveal } from "./Reveal";
import "../styles/tokens.css";
import "../styles/components.css";
import "../styles/landing.css";

const value = [
  { index: "01", title: "Battery Health Estimation", body: "Estimate State of Health from supported battery characterization data." },
  { index: "02", title: "Practical Usage Guidance", body: "Translate completed health analysis into clear guidance for monitoring and battery usage." },
  { index: "03", title: "Structured Data Validation", body: "Check submitted battery data before analysis so formatting and measurement issues are identified early." },
  { index: "04", title: "Clear Analysis Workflow", body: "Move from battery data to validation, health analysis, results, and recommended actions in one interface." },
];

const steps = [
  { step: "01", title: "Provide Battery Data", body: "Upload supported battery characterization data through the Re-Li dashboard." },
  { step: "02", title: "Validate", body: "Re-Li checks the supplied dataset against the expected input structure before analysis." },
  { step: "03", title: "Analyze Battery Health", body: "Run the health analysis to obtain an estimated State of Health." },
  { step: "04", title: "Review Guidance", body: "Use the result and generated usage guidance to support monitoring and follow-up decisions." },
];

const audiences = [
  { index: "01", title: "Battery Development Teams", body: "Evaluate characterization data and review battery-health estimates during testing and development." },
  { index: "02", title: "Fleet and Asset Teams", body: "Use battery-health analysis as an additional input when reviewing battery condition and monitoring requirements." },
  { index: "03", title: "Energy Storage Teams", body: "Evaluate supported battery datasets and translate health results into practical follow-up guidance." },
  { index: "04", title: "Research and Engineering Teams", body: "Explore battery-health behavior through a structured analysis workflow." },
];

const benefits = [
  "Clear State of Health results",
  "Structured data validation",
  "Practical usage guidance",
  "Simple analysis workflow",
  "Customer-facing results without unnecessary technical complexity",
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
          <h1 className="landing-hero__title mono">Re-Li</h1>
          <p className="landing-hero__tagline">Battery health intelligence for better lifecycle decisions.</p>
          <div className="landing-hero__body">
            <p className="landing-hero__lede">
              Provide battery test data, estimate State of Health, and receive practical guidance based on the completed health analysis.
            </p>
            <ul className="landing-hero__spec mono">
              <li>[01] Validated battery data</li>
              <li>[02] Estimated State of Health</li>
              <li>[03] Practical usage guidance</li>
            </ul>
          </div>
          <div className="landing-hero__actions">
            <a className="btn" href={dashboardPath()}>Open Dashboard</a>
            <a className="btn btn--secondary" href={contactPath()}>Contact Us</a>
          </div>
        </div>
      </header>

      <section className="landing-section" id="product" aria-labelledby="product-heading">
        <div className="landing-section__inner">
          <Reveal className="landing-section__head">
            <p className="eyebrow eyebrow--copper">/ 001</p>
            <h2 id="product-heading" className="landing-section__title mono">What Re-Li Provides</h2>
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
            <h2 id="how-it-works-heading" className="landing-section__title mono">How It Works</h2>
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

      <section className="landing-section landing-section--limits" id="who-its-for" aria-labelledby="who-its-for-heading">
        <div className="landing-section__inner">
          <Reveal className="landing-section__head">
            <p className="eyebrow eyebrow--copper">/ 003</p>
            <h2 id="who-its-for-heading" className="landing-section__title mono">Who It's For</h2>
          </Reveal>
          <div className="landing-grid landing-grid--cards">
            {audiences.map((item) => <Reveal as="article" className="panel panel--card" key={item.index}>
              <p className="panel__index mono" aria-hidden="true">{item.index}</p>
              <h3 className="panel__title">{item.title}</h3>
              <p className="panel__body">{item.body}</p>
            </Reveal>)}
          </div>
        </div>
      </section>

      <section className="landing-section" id="why-re-li" aria-labelledby="why-re-li-heading">
        <div className="landing-section__inner">
          <Reveal className="landing-section__head">
            <p className="eyebrow eyebrow--copper">/ 004</p>
            <h2 id="why-re-li-heading" className="landing-section__title mono">Why Re-Li</h2>
          </Reveal>
          <Reveal className="panel">
            <ul className="fact-list fact-list--columns">{benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
          </Reveal>
          <Reveal className="landing-cta">
            <div className="landing-cta__content">
              <h3 className="landing-cta__heading">Have battery data you want to evaluate?</h3>
              <p className="landing-cta__text">Talk to us about a Re-Li demo, technical evaluation, pilot, or partnership.</p>
            </div>
            <div className="landing-cta__actions">
              <a className="btn" href={contactPath()}>Contact Us</a>
              <a className="btn btn--secondary" href={dashboardPath()}>Open Dashboard</a>
            </div>
          </Reveal>
        </div>
      </section>
    </main>

    <LandingFooter />
  </div>;
}
