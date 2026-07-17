import { dashboardPath } from "../routes";
import type { ModelProfile } from "../types";
import { LimitationsPanel } from "../ui/LimitationsPanel";
import { CursorHalo } from "./CursorHalo";
import { LandingFooter } from "./LandingFooter";
import { LandingNav } from "./LandingNav";
import { NeuralBackdrop } from "./NeuralBackdrop";
import { Reveal } from "./Reveal";
import profileJson from "../../public/config/oxford-v1.json";
import "../styles/tokens.css";
import "../styles/components.css";
import "../styles/landing.css";

const profile = profileJson as unknown as ModelProfile;

const capabilities = [
  { index: "01", title: "Structured CSV input and validation", body: "Upload, paste, or edit Oxford-style charge-curve rows. Every row is checked against the canonical field contract before anything leaves the browser." },
  { index: "02", title: "State-of-health prediction", body: "The finalized Battery-PIMoE checkpoint estimates state of health at the next observed checkpoint, reported in percent." },
  { index: "03", title: "Predictive uncertainty", body: "Each prediction carries a predictive standard deviation in percentage points, so the estimate is never presented as a bare number." },
  { index: "04", title: "Optional actual-SOH comparison", body: "Supply actual_soh in the input and the dashboard reports the absolute error next to the prediction. Without it, no error is invented." },
  { index: "05", title: "Local AI-generated interpretation", body: "Optional plain-language reading of a completed prediction from llama3.2:3b on Ollama, running on the same host. It cannot change the numbers." },
  { index: "06", title: "Self-hosted CUDA/CPU inference", body: "Numerical inference runs in your own PyTorch environment. It prefers the NVIDIA GPU and falls back to CPU when CUDA is unavailable." },
  { index: "07", title: "Private pairing-token-protected service", body: "The inference service answers only requests carrying the pairing token it prints at startup. There is no account, sign-in, or registration." },
];

const architecture = [
  { step: "01", title: "GitHub Pages static frontend", body: "This site and the dashboard are static files. They hold no checkpoint, no dataset, and no token." },
  { step: "02", title: "Paired FastAPI service", body: "The dashboard sends validated rows to your BatteryAI service only after you explicitly pair with the endpoint and token." },
  { step: "03", title: "Battery-PIMoE checkpoint on CUDA/CPU", body: "The service loads the SHA-256-verified checkpoint and runs the numerical model on the host computer's GPU or CPU." },
  { step: "04", title: "Optional local Ollama llama3.2:3b", body: "When asked, the service sends a bounded prediction summary to Ollama over loopback and returns structured suggestions." },
];

const architectureFacts = [
  "GitHub Pages does not run the numerical model.",
  "The host computer performs all inference.",
  "Ollama is contacted only by the FastAPI service, over loopback.",
  "The browser never contacts Ollama directly.",
  "Remote use requires the host computer to remain online.",
];

const capabilityMatrix: Array<{ label: string; value: string; state: "available" | "unavailable" }> = [
  { label: "Model profile", value: profile.title, state: "available" },
  { label: "SOH prediction", value: "Available", state: "available" },
  { label: "Predictive uncertainty", value: "Available", state: "available" },
  { label: "Remaining useful life", value: "Unavailable", state: "unavailable" },
  { label: "Local CUDA inference", value: "Available", state: "available" },
  { label: "Local CPU inference", value: "Available", state: "available" },
  { label: "Browser ONNX", value: "Unavailable for Oxford V1", state: "unavailable" },
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
          <p className="eyebrow">Oxford V1 profile · Battery-PIMoE checkpoint</p>
          <h1 className="landing-hero__title mono">BatteryAI</h1>
          <p className="landing-hero__tagline">Physics-informed battery health intelligence</p>
          <div className="landing-hero__body">
            <p className="landing-hero__lede">
              BatteryAI accepts Oxford-style charge-curve data and runs a finalized Battery-PIMoE model to estimate state of health at the next
              observed checkpoint, together with predictive uncertainty. The model runs on a computer you control and pair with — not in this page.
            </p>
            <ul className="landing-hero__spec mono">
              <li>[01] State-of-health prediction</li>
              <li>[02] Predictive uncertainty</li>
              <li>[03] Self-hosted CUDA/CPU inference</li>
            </ul>
          </div>
          <div className="landing-hero__actions">
            <a className="btn" href={dashboardPath()}>Open Dashboard</a>
            <a className="btn btn--secondary" href="#architecture">View Architecture</a>
          </div>
        </div>
      </header>

      <section className="landing-section" id="capabilities" aria-labelledby="capabilities-heading">
        <div className="landing-section__inner">
          <Reveal className="landing-section__head">
            <p className="eyebrow eyebrow--copper">/ 001</p>
            <h2 id="capabilities-heading" className="landing-section__title mono">What BatteryAI does.</h2>
          </Reveal>
          <div className="landing-grid landing-grid--cards">
            {capabilities.map((item) => <Reveal as="article" className="panel panel--card" key={item.index}>
              <p className="panel__index mono" aria-hidden="true">{item.index}</p>
              <h3 className="panel__title">{item.title}</h3>
              <p className="panel__body">{item.body}</p>
            </Reveal>)}
          </div>
        </div>
      </section>

      <section className="landing-section" id="architecture" aria-labelledby="architecture-heading">
        <div className="landing-section__inner">
          <Reveal className="landing-section__head">
            <p className="eyebrow eyebrow--copper">/ 002</p>
            <h2 id="architecture-heading" className="landing-section__title mono">Architecture.</h2>
          </Reveal>
          <ol className="landing-chain">
            {architecture.map((item) => <Reveal as="li" className="landing-chain__item" key={item.step}>
              <div className="panel panel--chain">
                <p className="panel__index mono" aria-hidden="true">{item.step}</p>
                <h3 className="panel__title">{item.title}</h3>
                <p className="panel__body">{item.body}</p>
              </div>
            </Reveal>)}
          </ol>
          <Reveal className="panel panel--facts">
            <h3 className="mono panel__subtitle">What that means</h3>
            <ul className="fact-list">{architectureFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
          </Reveal>
        </div>
      </section>

      <section className="landing-section" id="model" aria-labelledby="model-heading">
        <div className="landing-section__inner">
          <Reveal className="landing-section__head">
            <p className="eyebrow eyebrow--copper">/ 003</p>
            <h2 id="model-heading" className="landing-section__title mono">Model capabilities.</h2>
          </Reveal>
          <div className="landing-grid landing-grid--split">
            <Reveal className="panel">
              <h3 className="mono panel__subtitle">Capability matrix</h3>
              <dl className="matrix">
                {capabilityMatrix.map((item) => <div className="matrix__row" key={item.label}>
                  <dt className="mono">{item.label}</dt>
                  <dd className={`matrix__value matrix__value--${item.state}`}>{item.value}</dd>
                </div>)}
              </dl>
              <p className="panel__note">{profile.browserModel.reason}</p>
            </Reveal>
            <Reveal className="panel">
              <h3 className="mono panel__subtitle">Active experts</h3>
              <ul className="chips">{profile.activeExperts.map((expert) => <li className="chip mono" key={expert}>{expert}</li>)}</ul>
              <h3 className="mono panel__subtitle">Target</h3>
              <p className="panel__body">{profile.target}</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section--limits" id="limitations" aria-labelledby="limitations-heading">
        <div className="landing-section__inner">
          <Reveal className="landing-section__head">
            <p className="eyebrow eyebrow--copper">/ 004</p>
            <h2 id="limitations-heading" className="landing-section__title mono">Limitations.</h2>
          </Reveal>
          <Reveal className="panel panel--limits">
            <LimitationsPanel profile={profile} />
          </Reveal>
          <Reveal className="landing-cta">
            <p className="landing-cta__text">Pair your own BatteryAI service and run the model on your data.</p>
            <a className="btn" href={dashboardPath()}>Open Dashboard</a>
          </Reveal>
        </div>
      </section>
    </main>

    <LandingFooter />
  </div>;
}
