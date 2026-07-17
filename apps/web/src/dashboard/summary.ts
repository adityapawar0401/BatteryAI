import type { CurveRow } from "../types";

export interface DatasetSummary {
  rowCount: number;
  sequences: string[];
  cells: string[];
  modalities: string[];
  sourceCheckpoints: string[];
  targetCheckpoints: string[];
  actualSohSupplied: boolean;
}

const unique = (values: string[]): string[] => [...new Set(values)];

/** Describes only what the supplied rows contain; it never scores or grades them. */
export function summarizeRows(rows: CurveRow[]): DatasetSummary | null {
  if (!rows.length) return null;
  return {
    rowCount: rows.length,
    sequences: unique(rows.map((row) => row.sequence_id)),
    cells: unique(rows.map((row) => row.cell_id)),
    modalities: unique(rows.map((row) => row.modality)),
    sourceCheckpoints: unique(rows.map((row) => row.source_checkpoint)),
    targetCheckpoints: unique(rows.map((row) => row.target_checkpoint)),
    actualSohSupplied: rows.some((row) => row.actual_soh != null),
  };
}

export function listOrDash(values: string[] | undefined): string {
  return values && values.length ? values.join(", ") : "—";
}
