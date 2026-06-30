import Papa from "papaparse";
import type { CurveRow } from "./types";

export const columns = ["sequence_id", "cell_id", "source_checkpoint", "target_checkpoint", "modality", "point_index", "time_s", "voltage_V", "capacity_Ah", "temperature_K", "actual_soh"] as const;
export const MAX_CSV_BYTES = 5 * 1024 * 1024;
const numeric = new Set(["point_index", "time_s", "voltage_V", "capacity_Ah", "temperature_K", "actual_soh"]);

export function parseCsv(text: string): CurveRow[] {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (value) => value.trim() });
  const fatalErrors = parsed.errors.filter((error) => error.code !== "UndetectableDelimiter");
  if (fatalErrors.length) throw new Error(fatalErrors.map((error) => `Row ${error.row ?? "?"}: ${error.message}`).join("; "));
  const headers = parsed.meta.fields ?? [];
  const missing = columns.slice(0, 10).filter((name) => !headers.includes(name));
  const unknown = headers.filter((name) => !columns.includes(name as typeof columns[number]));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);
  if (unknown.length) throw new Error(`Unknown columns: ${unknown.join(", ")}`);
  return parsed.data.map((record, index) => {
    const row: Record<string, unknown> = {};
    for (const column of columns) {
      const value = record[column];
      if (column === "actual_soh" && (value === undefined || value.trim() === "")) row[column] = null;
      else if (numeric.has(column)) {
        const converted = Number(value);
        if (!Number.isFinite(converted)) throw new Error(`Row ${index + 2}, ${column}: finite number required`);
        row[column] = converted;
      } else row[column] = value?.trim();
    }
    return row as unknown as CurveRow;
  });
}

export function validateRows(rows: CurveRow[]): string[] {
  const errors: string[] = [];
  if (rows.length < 2) errors.push("At least two curve points are required.");
  if (rows.length > 20000) errors.push("The 20,000-row limit was exceeded.");
  const groups = new Map<string, CurveRow[]>();
  rows.forEach((row, index) => {
    for (const field of ["point_index", "time_s", "voltage_V", "capacity_Ah", "temperature_K"] as const) if (!Number.isFinite(row[field])) errors.push(`Row ${index + 1}, ${field}: finite number required.`);
    if (row.time_s < 0) errors.push(`Row ${index + 1}, time_s: seconds must be nonnegative.`);
    if (row.voltage_V < 0 || row.voltage_V > 10) errors.push(`Row ${index + 1}, voltage_V: expected volts between 0 and 10.`);
    if (row.capacity_Ah < -20 || row.capacity_Ah > 20) errors.push(`Row ${index + 1}, capacity_Ah: expected ampere-hours between -20 and 20.`);
    if (row.temperature_K < 200 || row.temperature_K > 500) errors.push(`Row ${index + 1}, temperature_K: expected kelvin between 200 and 500.`);
    if (row.actual_soh != null && (!Number.isFinite(row.actual_soh) || row.actual_soh < 0 || row.actual_soh > 150)) errors.push(`Row ${index + 1}, actual_soh: expected percent between 0 and 150.`);
    if (!["C1ch", "C1dc", "OCVch", "OCVdc"].includes(row.modality)) errors.push(`Row ${index + 1}, modality: unsupported Oxford modality.`);
    groups.set(row.sequence_id, [...(groups.get(row.sequence_id) ?? []), row]);
  });
  if (groups.size > 64) errors.push("At most 64 sequences are allowed.");
  for (const [id, group] of groups) {
    const ordered = [...group].sort((a, b) => a.point_index - b.point_index);
    ordered.forEach((row, index) => { if (row.point_index !== index) errors.push(`${id}: point_index must run contiguously from 0.`); });
    ordered.slice(1).forEach((row, index) => { if (row.time_s < ordered[index].time_s) errors.push(`${id}: time_s decreases at point ${row.point_index}.`); });
    const identities = new Set(group.map((r) => `${r.cell_id}|${r.source_checkpoint}|${r.target_checkpoint}|${r.modality}`));
    if (identities.size !== 1) errors.push(`${id}: cell, checkpoints, and modality must be constant.`);
  }
  return [...new Set(errors)];
}

export function toCsv(rows: CurveRow[]): string { return Papa.unparse(rows, { columns: [...columns] }); }
export function resultsToCsv(results: Record<string, unknown>[]): string { return Papa.unparse(results); }

export async function readCsvFile(file: File): Promise<string> {
  if (file.size > MAX_CSV_BYTES) throw new Error(`CSV upload exceeds the ${MAX_CSV_BYTES / 1024 / 1024} MB limit.`);
  return file.text();
}
