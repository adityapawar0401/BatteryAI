import { dashboardPath } from "../routes";
import { CursorHalo } from "../landing/CursorHalo";
import { CONTACT_EMAIL, CONTACT_MAILTO, LandingFooter } from "../landing/LandingFooter";
import { LandingNav } from "../landing/LandingNav";
import { NeuralBackdrop } from "../landing/NeuralBackdrop";
import { Reveal } from "../landing/Reveal";
import "../styles/tokens.css";
import "../styles/components.css";
import "../styles/landing.css";

const contactReasons = [
  { index: "01", title: "Product Demo", body: "Discuss the Re-Li workflow and evaluate whether it fits a battery-health use case." },
  { index: "02", title: "Battery Data Evaluation", body: "Discuss supported battery datasets and potential analysis workflows." },
  { index: "03", title: "Pilot Opportunities", body: "Discuss a potential proof-of-concept or pilot evaluation." },
  { index: "04", title: "Partnerships", body: "Discuss technical, research, product, or commercial collaboration." },
];

export function ContactPage() {
  return <div className="landing">
    <NeuralBackdrop />
    <CursorHalo />
    <a className="skip-link" href="#main">Skip to content</a>
    <LandingNav page="contact" />

    <main id="main">
      <header className="contact-hero">
        <div className="landing-hero__glow" aria-hidden="true" />
        <div className="landing-section__inner">
          <p className="eyebrow">Re-Li</p>
          <h1 className="contact-hero__title mono">Contact Re-Li</h1>
          <p className="contact-hero__lede">Get in touch to discuss a demo, battery-data evaluation, pilot opportunity, technical collaboration, or partnership.</p>
          <div className="contact-email panel">
            <p className="contact-email__label mono">Email</p>
            <a className="contact-email__address mono" href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>
            <div className="contact-email__actions">
              <a className="btn" href={CONTACT_MAILTO}>Email Re-Li</a>
              <a className="btn btn--secondary" href={dashboardPath()}>Open Dashboard</a>
            </div>
          </div>
        </div>
      </header>

      <section className="landing-section" aria-labelledby="contact-reasons-heading">
        <div className="landing-section__inner">
          <Reveal className="landing-section__head">
            <p className="eyebrow eyebrow--copper">/ 001</p>
            <h2 id="contact-reasons-heading" className="landing-section__title mono">How We Can Help</h2>
          </Reveal>
          <div className="landing-grid landing-grid--cards">
            {contactReasons.map((reason) => <Reveal as="article" className="panel panel--card" key={reason.index}>
              <p className="panel__index mono" aria-hidden="true">{reason.index}</p>
              <h3 className="panel__title">{reason.title}</h3>
              <p className="panel__body">{reason.body}</p>
            </Reveal>)}
          </div>
        </div>
      </section>
    </main>

    <LandingFooter />
  </div>;
}
