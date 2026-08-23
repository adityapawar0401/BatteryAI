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
    vi.stubEnv("VITE_RELI_CONTACT_FORM_ENDPOINT", "https://forms.example.test/re-li");
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
    expect(fetchMock).toHaveBeenCalledWith("https://forms.example.test/re-li", expect.objectContaining({ method: "POST" }));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({ "Content-Type": "application/json", Accept: "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Asha Rao", email: "asha@example.com", organization: "Battery Lab",
      inquiry_type: "Product Demo", message: "We would like to evaluate a supported battery dataset.",
    });
    complete(new Response(null, { status: 204 }));
    expect(await screen.findByText("Thank you. Your inquiry has been sent to Re-Li.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Full Name/)).toHaveValue("");
  });

  it("shows a safe error and email fallback when a configured endpoint fails", async () => {
    vi.stubEnv("VITE_RELI_CONTACT_FORM_ENDPOINT", "https://forms.example.test/re-li");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Provider database secret exploded" }), { status: 500 }));
    render(<ContactForm />);
    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Send Inquiry" }));
    expect(await screen.findByText(`We couldn't send your inquiry right now. Please try again or email ${RELI_SUPPORT_EMAIL}.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email Re-Li" })).toHaveAttribute("href", RELI_SUPPORT_MAILTO);
    expect(document.body.textContent).not.toContain("Provider database secret exploded");
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
    vi.stubEnv("VITE_RELI_CONTACT_FORM_ENDPOINT", "https://forms.example.test/re-li");
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
