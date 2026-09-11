import { useEffect, useMemo, useState } from "react";
import { applyBuildDeploymentConfig, type AppConfig } from "../config";
import { clientErrorMessage } from "../clientText";
import { LandingFooter } from "../landing/LandingFooter";
import { LandingNav } from "../landing/LandingNav";
import { assetPath } from "../routes";
import "../styles/tokens.css";
import "../styles/components.css";
import "../styles/landing.css";
import "../styles/failure.css";

type Field = { name: string; label: string; unit: string };
type Group = { title: string; fields: Field[] };
type FailureResult = {
  task: "ev_failure";
  failure_probability: number;
  failure_flag: boolean;
  decision_threshold: number;
  model_version: string;
};

const groups: Group[] = [
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

const example: Record<string, string> = {
  battery_chemistry: "NMC", battery_capacity_kwh: "86.03", odometer_km: "109845", vehicle_age_years: "",
  cycle_count: "224", state_of_charge: "50.3", depth_of_discharge: "35.05", cell_voltage_avg: "3.4374",
  cell_voltage_std: "0.01371", pack_voltage: "859.36", cell_temperature_avg: "15.3", internal_resistance: "0.4487",
  charging_cycles_last_month: "6", fast_charge_ratio: "0.182", average_charge_power_kw: "", average_charging_time: "202.4",
  overnight_charging_ratio: "0.309", home_charging_ratio: "0.617", charging_interruptions: "0", overcharge_events: "0",
  average_speed: "39.1", average_trip_distance: "", regenerative_braking_usage: "57.4", highway_driving_ratio: "0.23",
  daily_distance: "92.7", average_ambient_temperature: "9.1", maximum_temperature: "15.4", minimum_temperature: "-1.9",
  humidity: "77.2", altitude: "341.1", last_service_days: "73",
};

export function FailureRiskPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [values, setValues] = useState<Record<string, string>>(example);
  const [token, setToken] = useState(() => sessionStorage.getItem("batteryai-pairing-token") ?? "");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FailureResult | null>(null);
  const endpoint = useMemo(() => config ? (config.remoteEnabled ? config.remoteApiUrl! : config.localEndpoint).replace(/\/$/, "") : "", [config]);

  useEffect(() => {
    fetch(assetPath("config/app.json"))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("configuration missing")))
      .then((value) => setConfig(applyBuildDeploymentConfig(value)))
      .catch(() => setError("Re-Li could not start. Refresh to try again."));
  }, []);

  const headers = { "Content-Type": "application/json", "X-BatteryAI-Token": token };
  async function connect() {
    setError("");
    try {
      const response = await fetch(`${endpoint}/v1/capabilities`, { headers });
      if (!response.ok) throw new Error(response.status === 401 ? "token rejected" : `HTTP ${response.status}`);
      const data = await response.json();
      if (!data.tasks?.ev_failure || data.model_version !== "oxford_ev_failure_v1_full") throw new Error("service capability mismatch");
      sessionStorage.setItem("batteryai-pairing-token", token);
      setConnected(true);
    } catch (reason) {
      setConnected(false);
      setError(clientErrorMessage(reason instanceof Error ? reason.message : ""));
    }
  }

  async function assess(event: React.FormEvent) {
    event.preventDefault();
    if (!connected) { setError("Connect to the analysis service before running an assessment."); return; }
    const snapshot = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, name === "battery_chemistry" ? value : value.trim() === "" ? null : Number(value)]));
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`${endpoint}/api/predict/failure`, { method: "POST", headers, body: JSON.stringify({ snapshot }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail?.message ?? data?.message ?? `HTTP ${response.status}`);
      setResult(data as FailureResult);
    } catch (reason) {
      setError(clientErrorMessage(reason instanceof Error ? reason.message : ""));
    } finally { setBusy(false); }
  }

  return <div className="landing">
    <a className="skip-link" href="#failure-form">Skip to assessment</a>
    <LandingNav />
    <main className="failure-page">
      <header className="failure-hero">
        <p className="eyebrow">Primary capability</p>
        <h1 className="mono">Battery Failure Risk</h1>
        <p>Estimate failure probability from one EV battery telemetry snapshot. This is classification, not a safety guarantee or time-to-failure forecast.</p>
      </header>

      <section className="failure-connect panel" aria-labelledby="connection-heading">
        <div><p className="eyebrow">Secure access</p><h2 id="connection-heading">Analysis service</h2></div>
        <label>Access code<input type="password" value={token} autoComplete="off" onChange={(event) => { setToken(event.target.value); setConnected(false); }} /></label>
        <button className="btn" type="button" onClick={connect} disabled={!config || !token}>{connected ? "Connected" : "Connect"}</button>
      </section>

      <form id="failure-form" onSubmit={assess}>
        <section className="failure-group panel">
          <div className="failure-group__head"><p className="eyebrow">Chemistry</p><h2>Cell chemistry</h2></div>
          <label>Battery chemistry<select value={values.battery_chemistry} onChange={(event) => setValues({ ...values, battery_chemistry: event.target.value })}>{["LFP", "LTO", "NCA", "NMC"].map((name) => <option key={name}>{name}</option>)}</select></label>
        </section>
        {groups.map((group) => <section className="failure-group panel" key={group.title}>
          <div className="failure-group__head"><p className="eyebrow">Snapshot inputs</p><h2>{group.title}</h2></div>
          <div className="failure-fields">{group.fields.map((field) => <label key={field.name}>{field.label}<span>{field.unit}</span><input type="number" step="any" value={values[field.name] ?? ""} placeholder="Missing" onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} /></label>)}</div>
        </section>)}
        <p className="failure-note">Blank values are sent explicitly as missing and handled by the trained missing-value masks. No target, brand, manufacturer, or derived health field is used.</p>
        <div className="failure-actions"><button className="btn" type="submit" disabled={busy}>{busy ? "Assessing…" : "Assess failure risk"}</button><button className="btn btn--secondary" type="button" onClick={() => setValues(example)}>Load held-out example</button></div>
      </form>

      {error && <p className="failure-error" role="alert">{error}</p>}
      {result && <section className="failure-result panel" aria-live="polite">
        <p className="eyebrow">Battery Failure Risk</p>
        <p className="failure-result__probability mono">{(result.failure_probability * 100).toFixed(1)}%</p>
        <div className="failure-meter" aria-hidden="true"><span style={{ width: `${result.failure_probability * 100}%` }} /></div>
        <dl className="matrix">
          <div className="matrix__row"><dt>Classification</dt><dd>{result.failure_flag ? "Failure flag" : "No failure flag"}</dd></div>
          <div className="matrix__row"><dt>Decision threshold</dt><dd>{(result.decision_threshold * 100).toFixed(1)}%</dd></div>
          <div className="matrix__row"><dt>Model</dt><dd>Battery-PIMoE Oxford + EV Failure V1</dd></div>
        </dl>
        <p className="failure-note">Interpret this snapshot estimate with engineering review. It does not predict when a failure could occur and does not certify the battery as safe.</p>
      </section>}
    </main>
    <LandingFooter />
  </div>;
}
