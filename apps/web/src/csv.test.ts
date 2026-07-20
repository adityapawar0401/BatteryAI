import { describe, expect, it } from "vitest";
import { containsInternalTerm } from "./clientText";
import { MAX_CSV_BYTES, parseCsv, readCsvFile, validateRows } from "./csv";

const header = "sequence_id,cell_id,source_checkpoint,target_checkpoint,modality,point_index,time_s,voltage_V,capacity_Ah,temperature_K,actual_soh";
const rows = ["s,c,a,b,C1ch,0,0,3.1,0,300,95", "s,c,a,b,C1ch,1,1,3.2,0.1,301,95"];

describe("canonical CSV", () => {
  it("parses pasted and uploaded text through one path", () => { const parsed = parseCsv([header, ...rows].join("\n")); expect(parsed).toHaveLength(2); expect(parsed[1].capacity_Ah).toBe(.1); });
  it("reports missing columns", () => expect(() => parseCsv("sequence_id\ns")).toThrow(/Missing required columns/));
  it("reports sequence ordering", () => { const parsed = parseCsv([header, ...rows].join("\n")); parsed[1].point_index = 4; expect(validateRows(parsed).join(" ")).toMatch(/contiguously/); });
  it("rejects values that reveal malformed physical units", () => {
    const parsed = parseCsv([header, ...rows].join("\n")); parsed[0].temperature_K = 40; parsed[1].capacity_Ah = 1000;
    expect(validateRows(parsed).join(" ")).toMatch(/kelvin/); expect(validateRows(parsed).join(" ")).toMatch(/ampere-hours/);
  });
  it("rejects oversized uploads before parsing", async () => {
    const file = new File([new Uint8Array(MAX_CSV_BYTES + 1)], "large.csv", { type: "text/csv" });
    await expect(readCsvFile(file)).rejects.toThrow(/5 MB/);
  });
});

describe("validation messages are customer-safe", () => {
  it("names no internal component while still identifying the offending field", () => {
    const bad = [
      { sequence_id: "s", cell_id: "c", source_checkpoint: "a", target_checkpoint: "b", modality: "XX", point_index: 0, time_s: 0, voltage_V: 99, capacity_Ah: 0, temperature_K: 999, actual_soh: 500 },
      { sequence_id: "s", cell_id: "c", source_checkpoint: "a", target_checkpoint: "b", modality: "XX", point_index: 5, time_s: -1, voltage_V: 3.5, capacity_Ah: 99, temperature_K: 298.15, actual_soh: null },
    ] as unknown as Parameters<typeof validateRows>[0];

    const errors = validateRows(bad);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(containsInternalTerm(error)).toBe(false);
      for (const term of ["oxford", "pimoe", "checkpoint hash", "cuda", "ollama"]) {
        expect(error.toLowerCase()).not.toContain(term);
      }
    }
    // The field name is still reported so the file can be corrected.
    expect(errors.join(" ")).toContain("modality");
    expect(errors.join(" ")).toContain("voltage_V");
  });
});
