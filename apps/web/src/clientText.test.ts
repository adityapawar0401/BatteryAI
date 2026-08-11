import { describe, expect, it } from "vitest";
import { clientErrorMessage, clientSafeSummary, containsInternalTerm, genericAnalysisSummary, keepClientSafe } from "./clientText";

describe("internal term detection", () => {
  it("flags text that names internal components", () => {
    for (const value of [
      "Battery prediction data for Oxford-v1 model",
      "The Battery-PIMoE checkpoint was used.",
      "Generated locally by Ollama",
      "Model limitations: next-observed-checkpoint horizon varies, RUL unavailable",
      "Inference ran on CUDA",
      "Served from GitHub Pages",
      "The remote backend is unreachable",
      "Final-training-cell examples are software fixtures",
      "Check State of Charge before continuing.",
      "The prediction model accuracy may be low.",
      "Review the software version and calibration history.",
    ]) expect(containsInternalTerm(value)).toBe(true);
  });

  it("leaves ordinary product copy alone", () => {
    for (const value of [
      "The battery health analysis completed successfully.",
      "Review the estimated state of health together with its uncertainty.",
      "Compare the result against your maintenance records.",
      "Repeat the analysis using the next available measurement.",
      "Row 3, voltage_V: expected volts between 0 and 10.",
      "Capacity coordinate against point index.",
    ]) expect(containsInternalTerm(value)).toBe(false);
  });

  it("does not match internal terms inside unrelated words", () => {
    for (const value of ["The curated report is ready.", "Serial numbers were recorded.", "A gradual decline was observed."]) {
      expect(containsInternalTerm(value)).toBe(false);
    }
  });
});

describe("generated output filtering", () => {
  it("drops only the list entries that name internal components", () => {
    expect(keepClientSafe([
      "Review the estimate against expected operating behavior.",
      "Model limitations: RUL unavailable.",
      "Repeat the analysis at the next measurement.",
    ])).toEqual([
      "Review the estimate against expected operating behavior.",
      "Repeat the analysis at the next measurement.",
    ]);
  });

  it("replaces a leaking summary with an equivalent product statement", () => {
    expect(clientSafeSummary("Battery prediction data for Oxford-v1 model")).toBe(genericAnalysisSummary);
    expect(containsInternalTerm(genericAnalysisSummary)).toBe(false);
  });

  it("keeps a clean summary untouched", () => {
    const summary = "State of health is estimated at 97.42% with moderate uncertainty.";
    expect(clientSafeSummary(summary)).toBe(summary);
  });
});

describe("customer-facing error messages", () => {
  it("translates access, availability, and insight failures", () => {
    expect(clientErrorMessage("Pairing token rejected.")).toBe("The access code is invalid or has expired.");
    expect(clientErrorMessage("Local engine returned HTTP 401.")).toBe("The access code is invalid or has expired.");
    expect(clientErrorMessage("Pair the local engine before sending battery data.")).toBe("Connect to the analysis service before running an analysis.");
    expect(clientErrorMessage("Browser ML is unavailable. Pair the local engine before Auto can send battery data to it.")).toBe("Connect to the analysis service before running an analysis.");
    expect(clientErrorMessage("The local LLM returned incomplete structured suggestions.")).toBe("AI insights are temporarily unavailable.");
    expect(clientErrorMessage("Ollama could not allocate enough resources for llama3.2:3b.")).toBe("AI insights are temporarily unavailable.");
  });

  it("never leaks an internal term through an unrecognized failure", () => {
    // Asserted against the raw vocabulary, not just the guard, so a term the
    // guard does not yet know about still fails this test.
    const forbidden = ["oxford", "pimoe", "ollama", "llama", "checkpoint", "cuda", "onnx", "funnel", "loopback", "tailscale", "pytorch", "sha-256", "rul"];
    for (const raw of [
      "BatteryAI endpoint is not the configured loopback or Funnel origin.",
      "Local inference response came from an unexpected checkpoint.",
      "Local engine checkpoint does not match the configured Oxford V1 model.",
      "Local engine returned HTTP 503.",
      "fetch failed",
      "",
    ]) {
      const message = clientErrorMessage(raw);
      expect(containsInternalTerm(message)).toBe(false);
      for (const term of forbidden) expect(message.toLowerCase()).not.toContain(term);
      expect(message).toBe(message.trim());
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it("keeps the canonical column names usable in validation output", () => {
    // `source_checkpoint` must survive even though bare "checkpoint" is internal.
    const message = "Row 4, source_checkpoint: cell, checkpoints, and modality must be constant.";
    expect(containsInternalTerm("sequence-1: source_checkpoint must be constant.")).toBe(false);
    expect(clientErrorMessage(message)).toBe(message);
    expect(clientErrorMessage("Missing required columns: target_checkpoint")).toBe("Missing required columns: target_checkpoint");
  });

  it("passes validation messages through so users can fix their file", () => {
    const validation = "Row 1, voltage_V: expected volts between 0 and 10.";
    expect(clientErrorMessage(validation)).toBe(validation);
    expect(clientErrorMessage("Missing required columns: cell_id")).toBe("Missing required columns: cell_id");
  });
});
