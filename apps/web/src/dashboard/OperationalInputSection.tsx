import { AnalysisSection } from "../analysis/AnalysisUI";

type Field = { name: string; label: string; unit: string };
type Group = { title: string; fields: Field[] };

export const operationalGroups: Group[] = [
  { title: "Operational", fields: [
    { name: "cell_voltage_avg", label: "Average cell voltage", unit: "V" },
    { name: "cell_temperature_avg", label: "Average cell temperature", unit: "°C" },
  ] },
  { title: "Usage / aging", fields: [
    { name: "cycle_count", label: "Cycle count", unit: "cycles" },
    { name: "vehicle_age_years", label: "Vehicle age", unit: "years" },
    { name: "odometer_km", label: "Odometer", unit: "km" },
    { name: "daily_distance", label: "Daily distance", unit: "km/day" },
    { name: "last_service_days", label: "Days since service", unit: "days" },
  ] },
  { title: "Pack context", fields: [
    { name: "battery_capacity_kwh", label: "Battery capacity", unit: "kWh" },
    { name: "pack_voltage", label: "Pack voltage", unit: "V" },
    { name: "cell_voltage_std", label: "Cell-voltage deviation", unit: "V" },
  ] },
  { title: "Physics state", fields: [
    { name: "state_of_charge", label: "State of charge", unit: "%" },
    { name: "depth_of_discharge", label: "Depth of discharge", unit: "%" },
    { name: "internal_resistance", label: "Pack internal resistance", unit: "mΩ" },
  ] },
  { title: "Charging context", fields: [
    { name: "charging_cycles_last_month", label: "Charges last month", unit: "count" },
    { name: "fast_charge_ratio", label: "Fast-charge ratio", unit: "0–1" },
    { name: "average_charge_power_kw", label: "Average charge power", unit: "kW" },
    { name: "average_charging_time", label: "Average charging time", unit: "minutes" },
    { name: "overnight_charging_ratio", label: "Overnight charging ratio", unit: "0–1" },
    { name: "home_charging_ratio", label: "Home charging ratio", unit: "0–1" },
    { name: "charging_interruptions", label: "Charging interruptions", unit: "count" },
    { name: "overcharge_events", label: "Overcharge events", unit: "count" },
  ] },
  { title: "Driving context", fields: [
    { name: "average_speed", label: "Average speed", unit: "km/h" },
    { name: "average_trip_distance", label: "Average trip distance", unit: "km" },
    { name: "regenerative_braking_usage", label: "Regenerative braking usage", unit: "%" },
    { name: "highway_driving_ratio", label: "Highway driving ratio", unit: "0–1" },
  ] },
  { title: "Environment", fields: [
    { name: "average_ambient_temperature", label: "Average ambient temperature", unit: "°C" },
    { name: "maximum_temperature", label: "Maximum ambient temperature", unit: "°C" },
    { name: "minimum_temperature", label: "Minimum ambient temperature", unit: "°C" },
    { name: "humidity", label: "Humidity", unit: "%" },
    { name: "altitude", label: "Altitude", unit: "m" },
  ] },
];

export const operationalExample: Record<string, string> = {
  battery_chemistry: "NMC", battery_capacity_kwh: "86.03", odometer_km: "109845", vehicle_age_years: "",
  cycle_count: "224", state_of_charge: "50.3", depth_of_discharge: "35.05", cell_voltage_avg: "3.4374",
  cell_voltage_std: "0.01371", pack_voltage: "859.36", cell_temperature_avg: "15.3", internal_resistance: "0.4487",
  charging_cycles_last_month: "6", fast_charge_ratio: "0.182", average_charge_power_kw: "", average_charging_time: "202.4",
  overnight_charging_ratio: "0.309", home_charging_ratio: "0.617", charging_interruptions: "0", overcharge_events: "0",
  average_speed: "39.1", average_trip_distance: "", regenerative_braking_usage: "57.4", highway_driving_ratio: "0.23",
  daily_distance: "92.7", average_ambient_temperature: "9.1", maximum_temperature: "15.4", minimum_temperature: "-1.9",
  humidity: "77.2", altitude: "341.1", last_service_days: "73",
};

export const emptyOperationalValues = (): Record<string, string> => ({
  battery_chemistry: "NMC",
  ...Object.fromEntries(operationalGroups.flatMap((group) => group.fields.map((field) => [field.name, ""]))),
});

export function hasOperationalValues(values: Record<string, string>): boolean {
  return operationalGroups.some((group) => group.fields.some((field) => (values[field.name] ?? "").trim() !== ""));
}

interface OperationalInputSectionProps {
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

export function OperationalInputSection({ values, onChange }: OperationalInputSectionProps) {
  return <AnalysisSection
    id="failure-risk"
    eyebrow="Operational input"
    title="Operational / EV data"
    description="Supply a supported telemetry snapshot to include Failure Risk in the assessment. Blank measurements remain explicitly missing."
    headerAside={<div className="dash-actions">
      <button className="btn btn--secondary" type="button" onClick={() => onChange({ ...operationalExample })}>Load EV example</button>
      <button className="btn btn--ghost" type="button" onClick={() => onChange(emptyOperationalValues())}>Clear EV data</button>
    </div>}
  >
    <fieldset className="analysis-input-group">
      <legend>Chemistry</legend>
      <div className="analysis-fields">
        <label className="analysis-field">Battery chemistry
          <span className="analysis-field__help">Supported chemistry family</span>
          <select value={values.battery_chemistry} onChange={(event) => onChange({ ...values, battery_chemistry: event.target.value })}>
            {["LFP", "LTO", "NCA", "NMC"].map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
      </div>
    </fieldset>
    {operationalGroups.map((group) => <fieldset className="analysis-input-group" key={group.title}>
      <legend>{group.title}</legend>
      <div className="analysis-fields">{group.fields.map((field) => <label className="analysis-field" key={field.name}>
        {field.label}<span className="analysis-field__help">{field.unit}</span>
        <input type="number" step="any" value={values[field.name] ?? ""} placeholder="Missing" onChange={(event) => onChange({ ...values, [field.name]: event.target.value })} />
      </label>)}</div>
    </fieldset>)}
    <p className="failure-note">These inputs are used only for Failure Risk. Diagnostic curve inputs below retain their separate processing contract.</p>
  </AnalysisSection>;
}
