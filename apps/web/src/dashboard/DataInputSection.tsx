import { useMemo, useState } from "react";
import { assetPath } from "../routes";
import { columns } from "../csv";
import type { CurveRow } from "../types";
import { DataSeriesChart, type SeriesPoint } from "./DataSeriesChart";
import type { DatasetSummary } from "./summary";

export type Tab = "upload" | "paste" | "table";
export type FieldSchema = Record<string, { description?: string; "x-unit"?: string }>;

export const labels: Record<string, string> = {
  sequence_id: "Sequence", cell_id: "Cell", source_checkpoint: "Source checkpoint", target_checkpoint: "Target checkpoint",
  modality: "Curve modality", point_index: "Point", time_s: "Time", voltage_V: "Voltage", capacity_Ah: "Capacity coordinate",
  temperature_K: "Temperature", actual_soh: "Actual SOH",
};

interface DataInputSectionProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  csvText: string;
  onCsvTextChange: (text: string) => void;
  onAcceptText: (text: string) => void;
  onUpload: (file: File) => void;
  rows: CurveRow[];
  summary: DatasetSummary | null;
  fieldSchema: FieldSchema;
  notice: string;
  onEditRow: (index: number, field: keyof CurveRow, value: string) => void;
  onAddRow: () => void;
  onValidate: () => void;
  onClear: () => void;
  onLoadExample: () => void;
}

const chartSeries: Array<{ key: "voltage_V" | "capacity_Ah" | "temperature_K"; title: string; unit: string; accent: "volt" | "copper" }> = [
  { key: "voltage_V", title: "Voltage", unit: "V", accent: "volt" },
  { key: "capacity_Ah", title: "Capacity coordinate", unit: "Ah", accent: "volt" },
  { key: "temperature_K", title: "Temperature", unit: "K", accent: "copper" },
];

export function DataInputSection(props: DataInputSectionProps) {
  const { tab, onTabChange, csvText, onCsvTextChange, onAcceptText, onUpload, rows, summary, fieldSchema, notice } = props;
  const [chartSequence, setChartSequence] = useState("");

  const sequences = summary?.sequences ?? [];
  const activeSequence = sequences.includes(chartSequence) ? chartSequence : sequences[0] ?? "";
  const plotted = useMemo(
    () => rows.filter((row) => row.sequence_id === activeSequence).sort((a, b) => a.point_index - b.point_index),
    [activeSequence, rows],
  );
  const seriesFor = (key: "voltage_V" | "capacity_Ah" | "temperature_K"): SeriesPoint[] =>
    plotted.map((row) => ({ x: row.point_index, y: row[key] }));

  return <section className="dash-section" id="data" aria-labelledby="data-heading">
    <div className="dash-section__head">
      <div>
        <p className="eyebrow">Data</p>
        <h2 id="data-heading">Battery data</h2>
      </div>
      <div className="dash-actions">
        <a className="btn btn--secondary" href={assetPath("fixtures/oxford-template.csv")} download>Download template</a>
        <button type="button" className="btn btn--secondary" onClick={props.onLoadExample}>Load example</button>
      </div>
    </div>

    <div className="tabs" role="tablist" aria-label="Input method">
      {(["upload", "paste", "table"] as Tab[]).map((item) => <button
        type="button" role="tab" key={item} id={`tab-${item}`} aria-selected={tab === item} aria-controls={`panel-${item}`}
        className={`tabs__tab mono${tab === item ? " tabs__tab--active" : ""}`} onClick={() => onTabChange(item)}
      >{item === "upload" ? "Upload data" : item === "paste" ? "Paste CSV" : "Review data"}</button>)}
    </div>

    {tab === "upload" && <div role="tabpanel" id="panel-upload" aria-labelledby="tab-upload">
      <label className="dropzone">
        <span className="dropzone__title">Upload battery data</span>
        <span className="dropzone__hint mono">CSV up to 5 MB</span>
        <input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); }} />
      </label>
    </div>}

    {tab === "paste" && <div role="tabpanel" id="panel-paste" aria-labelledby="tab-paste">
      <label className="field">
        <span className="field__label">CSV text</span>
        <textarea rows={12} value={csvText} onChange={(event) => onCsvTextChange(event.target.value)} aria-describedby="csv-columns" spellCheck={false} />
      </label>
      <small id="csv-columns" className="dash-hint mono">Columns: {columns.join(", ")}</small>
      <div className="dash-actions"><button type="button" className="btn btn--secondary" onClick={() => onAcceptText(csvText)}>Parse pasted CSV</button></div>
    </div>}

    {tab === "table" && <div role="tabpanel" id="panel-table" aria-labelledby="tab-table">
      {rows.length === 0
        ? <p className="dash-empty">No data yet. Load the example, paste CSV, or add a row to start editing.</p>
        : <div className="table-wrap">
          <table>
            <thead><tr>{columns.map((column) => <th key={column} scope="col">
              <span className="table__head">{labels[column]}{column !== "actual_soh" && <i aria-hidden="true">*</i>}</span>
              <small className="mono">{fieldSchema[column]?.["x-unit"] ?? ""}</small>
            </th>)}</tr></thead>
            <tbody>{rows.slice(0, 100).map((row, index) => <tr key={`${row.sequence_id}-${index}`}>
              {columns.map((column) => <td key={column}>
                <input aria-label={`${labels[column]} row ${index + 1}`} value={row[column] ?? ""} onChange={(event) => props.onEditRow(index, column, event.target.value)} />
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>}
      {rows.length > 100 && <p className="dash-hint">Showing the first 100 of {rows.length.toLocaleString()} editable rows. All rows will be validated and inferred.</p>}
    </div>}

    <div className="dash-actions dash-actions--wrap">
      <button type="button" className="btn btn--secondary" onClick={props.onAddRow}>Add row</button>
      <button type="button" className="btn" onClick={props.onValidate}>Validate data</button>
      <button type="button" className="btn btn--ghost" onClick={props.onClear}>Clear data</button>
    </div>
    <p className="dash-notice" role="status">{notice}</p>

    <details className="dash-details">
      <summary>Re-Li CSV format</summary>
      <dl className="field-help">
        {columns.map((column) => <div className="field-help__row" key={column}>
          <dt className="mono">{column}{column !== "actual_soh" ? <span className="field-help__req"> required</span> : <span className="field-help__opt"> optional</span>}</dt>
          <dd>{fieldSchema[column]?.description ?? ""}{fieldSchema[column]?.["x-unit"] ? ` Unit: ${fieldSchema[column]?.["x-unit"]}.` : ""}</dd>
        </div>)}
      </dl>
    </details>

    <div className="dash-subhead"><h3 className="mono">Input Data Preview</h3>
      {sequences.length > 1 && <div className="field field--inline">
        <label className="field__label" htmlFor="chart-sequence">Sequence</label>
        <select id="chart-sequence" value={activeSequence} onChange={(event) => setChartSequence(event.target.value)}>
          {sequences.map((sequence) => <option key={sequence} value={sequence}>{sequence}</option>)}
        </select>
      </div>}
    </div>
    {plotted.length < 2
      ? <p className="dash-empty">Charts appear once battery data is added. They are drawn only from the data above.</p>
      : <div className="chart-grid">
        {chartSeries.map((series) => <DataSeriesChart key={series.key} title={series.title} unit={series.unit} xLabel="point index" accent={series.accent} points={seriesFor(series.key)} />)}
      </div>}
  </section>;
}
