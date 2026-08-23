import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RELI_SUPPORT_EMAIL, RELI_SUPPORT_MAILTO } from "../landing/LandingFooter";
import { ContactForm } from "./ContactForm";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function fillValidForm(organization = "Battery Lab"): void {
  fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: "Asha Rao" } });
  fireEvent.change(screen.getByLabelText(/Work Email/), { target: { value: "asha@example.com" } });
  fireEvent.change(screen.getByLabelText(/Company \/ Organization/), { target: { value: organization } });
  fireEvent.change(screen.getByLabelText(/What would you like to discuss/), { target: { value: "Product Demo" } });
  fireEvent.change(screen.getByLabelText(/Message/), { target: { value: "We would like to evaluate a supported battery dataset." } });
}

describe("contact inquiry form", () => {
  it("renders every field, neutral select placeholder, privacy text, and honeypot", () => {
    const { container } = render(<ContactForm />);
    expect(screen.getByLabelText(/Full Name/)).toHaveAttribute("name", "name");
    expect(screen.getByLabelText(/Work Email/)).toHaveAttribute("name", "email");
    expect(screen.getByLabelText(/Company \/ Organization/)).toHaveAttribute("name", "organization");
    expect(screen.getByLabelText(/What would you like to discuss/)).toHaveValue("");
    expect(screen.getByLabelText(/Message/)).toHaveAttribute("name", "message");
    expect(screen.getByRole("button", { name: "Send Inquiry" })).toBeInTheDocument();
    expect(screen.getByText("The information you submit will only be used to respond to your inquiry.")).toBeInTheDocument();
    const honeypot = container.querySelector<HTMLInputElement>('input[name="website"]');
    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot).toHaveAttribute("aria-hidden", "true");
  });

  it("rejects blank required fields and associates errors with their controls", () => {
    render(<ContactForm />);
    fireEvent.click(screen.getByRole("button", { name: "Send Inquiry" }));
    for (const message of ["Enter your full name.", "Enter your email address.", "Select an inquiry type.", "Enter a message."]) {
      expect(screen.getByText(message)).toBeInTheDocument();
    }
    expect(screen.getByLabelText(/Full Name/)).toHaveAttribute("aria-describedby", "contact-name-error");
    expect(screen.getByLabelText(/Work Email/)).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects an invalid email, missing inquiry type, and too-short message without clearing valid fields", () => {
    render(<ContactForm />);
    fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: "Asha Rao" } });
    fireEvent.change(screen.getByLabelText(/Work Email/), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText(/Message/), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Inquiry" }));
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Select an inquiry type.")).toBeInTheDocument();
    expect(screen.getByText("Message must be at least 10 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/)).toHaveValue("Asha Rao");
  });

  it("posts the exact trimmed JSON payload, prevents duplicates, and shows confirmed success", async () => {
    vi.stubEnv("VITE_RELI_CONTACT_FORM_ENDPOINT", "https://formspree.io/f/test-form-id");
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { complete = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pending);
    render(<ContactForm />);
    fillValidForm("  Battery Lab  ");
    const form = screen.getByRole("form", { name: "Contact inquiry form" });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    expect(screen.queryByText("Thank you. Your inquiry has been sent to Re-Li.")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("https://formspree.io/f/test-form-id", expect.objectContaining({ method: "POST" }));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({ "Content-Type": "application/json", Accept: "application/json" });
    const payload = JSON.parse(String(init.body));
    expect(payload).toEqual({
      name: "Asha Rao", email: "asha@example.com", organization: "Battery Lab",
      inquiry_type: "Product Demo", message: "We would like to evaluate a supported battery dataset.",
    });
    expect(Object.keys(payload).sort()).toEqual(["email", "inquiry_type", "message", "name", "organization"]);
    expect(JSON.stringify(payload)).not.toContain(RELI_SUPPORT_EMAIL);
    for (const forbidden of ["website", "token", "tailscale", "csv", "model", "github", "cookie", "recipient"]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
    complete(new Response(null, { status: 204 }));
    expect(await screen.findByText("Thank you. Your inquiry has been sent to Re-Li.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/)).toHaveValue("");
  });

  it("shows a safe error and email fallback when a configured endpoint fails", async () => {
    vi.stubEnv("VITE_RELI_CONTACT_FORM_ENDPOINT", "https://formspree.io/f/test-form-id");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Provider database secret exploded" }), { status: 500 }));
    render(<ContactForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Send Inquiry" }));
    expect(await screen.findByText(`We couldn't send your inquiry right now. Please try again or email ${RELI_SUPPORT_EMAIL}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email Re-Li" })).toHaveAttribute("href", RELI_SUPPORT_MAILTO);
    expect(document.body.textContent).not.toContain("Provider database secret exploded");
  });

  it("maps structured provider validation errors to safe field messages without rendering the response", async () => {
    vi.stubEnv("VITE_RELI_CONTACT_FORM_ENDPOINT", "https://formspree.io/f/test-form-id");
    const rawProviderText = "Formspree internal validator rejected this field with trace 9876";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      errors: [
        { code: "TYPE_EMAIL", field: "email", message: rawProviderText },
        { code: "TYPE_TEXT", field: "internal_metadata", message: "private provider detail" },
        { code: "TYPE_TEXT", field: "__proto__", message: "prototype provider detail" },
      ],
    }), { status: 422, headers: { "Content-Type": "application/json" } }));
    render(<ContactForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Send Inquiry" }));
    expect(await screen.findByText("Check your email address and try again.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Work Email/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(`We couldn't send your inquiry right now. Please try again or email ${RELI_SUPPORT_EMAIL}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email Re-Li" })).toHaveAttribute("href", RELI_SUPPORT_MAILTO);
    expect(document.body.textContent).not.toContain(rawProviderText);
    expect(document.body.textContent).not.toContain("private provider detail");
    expect(document.body.textContent).not.toContain("prototype provider detail");
    expect(document.body.textContent).not.toContain("Formspree");
  });

  it("shows a customer-friendly retry message and email fallback for rate limiting", async () => {
    vi.stubEnv("VITE_RELI_CONTACT_FORM_ENDPOINT", "https://formspree.io/f/test-form-id");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Formspree rate limit" }), { status: 429 }));
    render(<ContactForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Send Inquiry" }));
    expect(await screen.findByText(`Too many inquiries were submitted recently. Please wait a moment and try again, or email ${RELI_SUPPORT_EMAIL}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email Re-Li" })).toHaveAttribute("href", RELI_SUPPORT_MAILTO);
    expect(screen.queryByText(/Thank you/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("429");
    expect(document.body.textContent).not.toContain("Formspree");
  });

  it("shows the safe error and email fallback after a network failure", async () => {
    vi.stubEnv("VITE_RELI_CONTACT_FORM_ENDPOINT", "https://formspree.io/f/test-form-id");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("DNS lookup exposed provider.example"));
    render(<ContactForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Send Inquiry" }));
    expect(await screen.findByText(`We couldn't send your inquiry right now. Please try again or email ${RELI_SUPPORT_EMAIL}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email Re-Li" })).toHaveAttribute("href", RELI_SUPPORT_MAILTO);
    expect(screen.queryByText(/Thank you/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("provider.example");
  });

  it("uses the honest email fallback without a network request when no endpoint is configured", async () => {
    vi.stubEnv("VITE_RELI_CONTACT_FORM_ENDPOINT", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<ContactForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Send Inquiry" }));
    expect(await screen.findByText(`Online inquiry submission is temporarily unavailable. Please email us at ${RELI_SUPPORT_EMAIL}.`)).toBeInTheDocument();
    expect(screen.queryByText(/Thank you/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email Re-Li" })).toHaveAttribute("href", RELI_SUPPORT_MAILTO);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit a populated honeypot or report false success", async () => {
    vi.stubEnv("VITE_RELI_CONTACT_FORM_ENDPOINT", "https://formspree.io/f/test-form-id");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { container } = render(<ContactForm />);
    fillValidForm();
    fireEvent.change(container.querySelector('input[name="website"]')!, { target: { value: "https://spam.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Inquiry" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Thank you/)).not.toBeInTheDocument();
  });
});
