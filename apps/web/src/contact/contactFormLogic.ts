export const INQUIRY_TYPES = [
  "Product Demo",
  "Battery Data Evaluation",
  "Pilot Opportunity",
  "Partnership",
  "Research Collaboration",
  "Technical Question",
  "Other",
] as const;

export type InquiryType = typeof INQUIRY_TYPES[number];

export interface ContactFormFields {
  name: string;
  email: string;
  organization: string;
  inquiry_type: "" | InquiryType;
  message: string;
  website: string;
}

export type ContactFormErrors = Partial<Record<"name" | "email" | "organization" | "inquiry_type" | "message", string>>;

const PROVIDER_FIELD_ERROR_MESSAGES: Required<ContactFormErrors> = {
  name: "Check your full name and try again.",
  email: "Check your email address and try again.",
  organization: "Check your organization and try again.",
  inquiry_type: "Select an inquiry type and try again.",
  message: "Check your message and try again.",
};

export const EMPTY_CONTACT_FORM: ContactFormFields = {
  name: "",
  email: "",
  organization: "",
  inquiry_type: "",
  message: "",
  website: "",
};

export function validateContactForm(fields: ContactFormFields): ContactFormErrors {
  const errors: ContactFormErrors = {};
  const name = fields.name.trim();
  const email = fields.email.trim();
  const organization = fields.organization.trim();
  const message = fields.message.trim();

  if (!name) errors.name = "Enter your full name.";
  else if (name.length > 120) errors.name = "Name must be 120 characters or fewer.";

  if (!email) errors.email = "Enter your email address.";
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";

  if (organization.length > 160) errors.organization = "Organization must be 160 characters or fewer.";
  if (!INQUIRY_TYPES.includes(fields.inquiry_type as InquiryType)) errors.inquiry_type = "Select an inquiry type.";

  if (!message) errors.message = "Enter a message.";
  else if (message.length < 10) errors.message = "Message must be at least 10 characters.";
  else if (message.length > 3000) errors.message = "Message must be 3000 characters or fewer.";

  return errors;
}

export function configuredContactEndpoint(): string | null {
  const value = import.meta.env.VITE_RELI_CONTACT_FORM_ENDPOINT;
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.username || url.password) return null;
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isContactField(value: unknown): value is keyof ContactFormErrors {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PROVIDER_FIELD_ERROR_MESSAGES, value);
}

export async function safeProviderFieldErrors(response: Response): Promise<ContactFormErrors> {
  let payload: unknown;
  try {
    payload = await response.json() as unknown;
  } catch {
    return {};
  }
  if (!isRecord(payload) || !Array.isArray(payload.errors)) return {};

  const errors: ContactFormErrors = {};
  for (const item of payload.errors) {
    if (!isRecord(item) || typeof item.message !== "string" || !isContactField(item.field)) continue;
    errors[item.field] = PROVIDER_FIELD_ERROR_MESSAGES[item.field];
  }
  return errors;
}
