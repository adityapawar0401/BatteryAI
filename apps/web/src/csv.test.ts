import { describe, expect, it } from "vitest";
import { parseCsv, validateRows } from "./csv";

const header = "sequence_id,cell_id,source_checkpoint,target_checkpoint,modality,point_index,time_s,voltage_V,capacity_Ah,temperature_K,actual_soh";
const rows = ["s,c,a,b,C1ch,0,0,3.1,0,300,95", "s,c,a,b,C1ch,1,1,3.2,0.1,301,95"];

describe("canonical CSV", () => {
  it("parses pasted and uploaded text through one path", () => { const parsed = parseCsv([header, ...rows].join("\n")); expect(parsed).toHaveLength(2); expect(parsed[1].capacity_Ah).toBe(.1); });
  it("reports missing columns", () => expect(() => parseCsv("sequence_id\ns")).toThrow(/Missing required columns/));
  it("reports sequence ordering", () => { const parsed = parseCsv([header, ...rows].join("\n")); parsed[1].point_index = 4; expect(validateRows(parsed).join(" ")).toMatch(/contiguously/); });
});
