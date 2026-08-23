import { type FormEvent, useRef, useState } from "react";
import { RELI_SUPPORT_EMAIL, RELI_SUPPORT_MAILTO } from "../landing/LandingFooter";
import {
  configuredContactEndpoint,
  EMPTY_CONTACT_FORM,
  INQUIRY_TYPES,
  type ContactFormErrors,
  type ContactFormFields,
  validateContactForm,
} from "./contactFormLogic";

type SubmissionState = "idle" | "submitting" | "success" | "error";

const MISSING_ENDPOINT_MESSAGE = `Online inquiry submission is temporarily unavailable. Please email us at ${RELI_SUPPORT_EMAIL}.`;
const FAILURE_MESSAGE = `We couldn't send your inquiry right now. Please try again or email ${RELI_SUPPORT_EMAIL}.`;
const SUCCESS_MESSAGE = "Thank you. Your inquiry has been sent to Re-Li.";

export function ContactForm() {
  const [fields, setFields] = useState<ContactFormFields>(EMPTY_CONTACT_FORM);
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);

  function updateField<K extends keyof ContactFormFields>(field: K, value: ContactFormFields[K]): void {
    setFields((current) => ({ ...current, [field]: value }));
    if (field !== "website") setErrors((current) => ({ ...current, [field]: undefined }));
    if (submissionState !== "submitting") { setSubmissionState("idle"); setStatusMessage(""); }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current) return;

    const nextErrors = validateContactForm(fields);
    setErrors(nextErrors);
    setStatusMessage("");
    if (Object.keys(nextErrors).length) {
      setSubmissionState("idle");
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    if (fields.website.trim()) {
      setSubmissionState("error");
      setStatusMessage(FAILURE_MESSAGE);
      return;
    }

    const endpoint = configuredContactEndpoint();
    if (!endpoint) {
      setSubmissionState("error");
      setStatusMessage(MISSING_ENDPOINT_MESSAGE);
      return;
    }

    submittingRef.current = true;
    setSubmissionState("submitting");
    setStatusMessage("Sending your inquiry...");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: fields.name.trim(),
          email: fields.email.trim(),
          organization: fields.organization.trim(),
          inquiry_type: fields.inquiry_type,
          message: fields.message.trim(),
        }),
      });
      if (!response.ok) throw new Error("Contact submission was rejected.");
      setFields(EMPTY_CONTACT_FORM);
      setErrors({});
      setSubmissionState("success");
      setStatusMessage(SUCCESS_MESSAGE);
    } catch {
      setSubmissionState("error");
      setStatusMessage(FAILURE_MESSAGE);
    } finally {
      submittingRef.current = false;
    }
  }

  const showEmailFallback = submissionState === "error";

  return <form ref={formRef} className="contact-form" aria-label="Contact inquiry form" onSubmit={submit} noValidate>
    <div className="contact-form__field">
      <label htmlFor="contact-name">Full Name <span className="contact-form__required">Required</span></label>
      <input id="contact-name" name="name" value={fields.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Your name" autoComplete="name" required maxLength={120} aria-invalid={!!errors.name} aria-describedby={errors.name ? "contact-name-error" : undefined} />
      {errors.name && <p className="contact-form__error" id="contact-name-error">{errors.name}</p>}
    </div>

    <div className="contact-form__field">
      <label htmlFor="contact-email">Work Email <span className="contact-form__required">Required</span></label>
      <input id="contact-email" name="email" type="email" value={fields.email} onChange={(event) => updateField("email", event.target.value)} placeholder="you@company.com" autoComplete="email" required maxLength={254} aria-invalid={!!errors.email} aria-describedby={errors.email ? "contact-email-error" : undefined} />
      {errors.email && <p className="contact-form__error" id="contact-email-error">{errors.email}</p>}
    </div>

    <div className="contact-form__field">
      <label htmlFor="contact-organization">Company / Organization <span className="contact-form__optional">Optional</span></label>
      <input id="contact-organization" name="organization" value={fields.organization} onChange={(event) => updateField("organization", event.target.value)} placeholder="Company or organization" autoComplete="organization" maxLength={160} aria-invalid={!!errors.organization} aria-describedby={errors.organization ? "contact-organization-error" : undefined} />
      {errors.organization && <p className="contact-form__error" id="contact-organization-error">{errors.organization}</p>}
    </div>

    <div className="contact-form__field">
      <label htmlFor="contact-inquiry-type">What would you like to discuss? <span className="contact-form__required">Required</span></label>
      <select id="contact-inquiry-type" name="inquiry_type" value={fields.inquiry_type} onChange={(event) => updateField("inquiry_type", event.target.value as ContactFormFields["inquiry_type"])} required aria-invalid={!!errors.inquiry_type} aria-describedby={errors.inquiry_type ? "contact-inquiry-type-error" : undefined}>
        <option value="">Select an inquiry type</option>
        {INQUIRY_TYPES.map((type) => <option value={type} key={type}>{type}</option>)}
      </select>
      {errors.inquiry_type && <p className="contact-form__error" id="contact-inquiry-type-error">{errors.inquiry_type}</p>}
    </div>

    <div className="contact-form__field contact-form__field--wide">
      <label htmlFor="contact-message">Message <span className="contact-form__required">Required</span></label>
      <textarea id="contact-message" name="message" value={fields.message} onChange={(event) => updateField("message", event.target.value)} placeholder="Tell us about your battery application, data, use case, or how you would like to work with Re-Li." required minLength={10} maxLength={3000} rows={8} aria-invalid={!!errors.message} aria-describedby={errors.message ? "contact-message-help contact-message-error" : "contact-message-help"} />
      <p className="contact-form__help" id="contact-message-help">10 to 3000 characters</p>
      {errors.message && <p className="contact-form__error" id="contact-message-error">{errors.message}</p>}
    </div>

    <div className="contact-form__honeypot" aria-hidden="true">
      <label htmlFor="contact-website">Leave this field empty</label>
      <input id="contact-website" name="website" value={fields.website} onChange={(event) => updateField("website", event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" />
    </div>

    <div className="contact-form__actions contact-form__field--wide">
      <button className="btn" type="submit" disabled={submissionState === "submitting"}>{submissionState === "submitting" ? "Sending..." : "Send Inquiry"}</button>
      <p>Prefer email? Contact <a href={RELI_SUPPORT_MAILTO}>{RELI_SUPPORT_EMAIL}</a></p>
    </div>

    <div className="contact-form__status contact-form__field--wide" aria-live="polite" aria-atomic="true">
      {statusMessage && <p className={`contact-form__status-message contact-form__status-message--${submissionState}`} role={submissionState === "error" ? "alert" : "status"}>{statusMessage}</p>}
      {showEmailFallback && <a className="btn btn--secondary" href={RELI_SUPPORT_MAILTO}>Email Re-Li</a>}
    </div>

    <p className="contact-form__privacy contact-form__field--wide">The information you submit will only be used to respond to your inquiry.</p>
  </form>;
}
