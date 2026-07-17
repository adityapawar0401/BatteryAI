import { describe, expect, it } from "vitest";
import type { CurveRow } from "../types";
import { listOrDash, summarizeRows } from "./summary";

const row = (overrides: Partial<CurveRow> = {}): CurveRow => ({
  sequence_id: "Cell1:cyc0000->cyc0100", cell_id: "Cell1", source_checkpoint: "cyc0000", target_checkpoint: "cyc0100",
  modality: "C1ch", point_index: 0, time_s: 0, voltage_V: 3.5, capacity_Ah: 0.1, temperature_K: 298.15, actual_soh: null, ...overrides,
});

describe("dataset summary", () => {
  it("reports nothing for an empty dataset", () => expect(summarizeRows([])).toBeNull());

  it("describes only what the supplied rows contain", () => {
    const summary = summarizeRows([row(), row({ point_index: 1 })]);
    expect(summary).toEqual({
      rowCount: 2,
      sequences: ["Cell1:cyc0000->cyc0100"],
      cells: ["Cell1"],
      modalities: ["C1ch"],
      sourceCheckpoints: ["cyc0000"],
      targetCheckpoints: ["cyc0100"],
      actualSohSupplied: false,
    });
  });

  it("flags supplied actual SOH and deduplicates multi-sequence identities", () => {
    const summary = summarizeRows([row(), row({ sequence_id: "Cell2:cyc0000->cyc0100", cell_id: "Cell2", actual_soh: 97.5 })]);
    expect(summary?.actualSohSupplied).toBe(true);
    expect(summary?.sequences).toEqual(["Cell1:cyc0000->cyc0100", "Cell2:cyc0000->cyc0100"]);
    expect(summary?.cells).toEqual(["Cell1", "Cell2"]);
    expect(summary?.modalities).toEqual(["C1ch"]);
  });

  it("renders an em dash rather than an empty list", () => {
    expect(listOrDash([])).toBe("—");
    expect(listOrDash(undefined)).toBe("—");
    expect(listOrDash(["C1ch", "OCVch"])).toBe("C1ch, OCVch");
  });
});
