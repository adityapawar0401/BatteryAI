import { useEffect, useMemo, useState } from "react";
import { AnalysisError, AnalysisPageShell, AnalysisSection, AnalyzeButton, MetricTile, ModelIdentity, PredictionResultCard } from "../analysis/AnalysisUI";
import { applyBuildDeploymentConfig, type AppConfig } from "../config";
import { clientErrorMessage } from "../clientText";
import { ConnectionPanel } from "../dashboard/ConnectionPanel";
import { LandingFooter } from "../landing/LandingFooter";
import { LandingNav } from "../landing/LandingNav";
import { assetPath } from "../routes";
import "../styles/tokens.css";
import "../styles/components.css";
import "../styles/landing.css";
import "../styles/analysis.css";
import "../styles/failure.css";

type Field = { name: string; label: string; unit: string };
type Group = { title: string; fields: Field[] };
type FailureResult = {
  task: "ev_failure";
  failure_probability: number;
  failure_flag: boolean;
  decision_threshold: number;
  model_version: string;
  model_sha256: string;
  active_experts: string[];
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
    <a className="skip-link" href="#input">Skip to assessment</a>
    <LandingNav />
    <main className="failure-page">
      <AnalysisPageShell
        eyebrow="EV capability"
        title="Battery Failure Risk"
        description="Estimate failure probability from one supported EV battery telemetry snapshot. This classification is not a safety guarantee or time-to-failure forecast."
      >
        <AnalysisSection id="connection" eyebrow="Secure access" title="Analysis service" description="Use the same secure BatteryAI service as SOH Analysis.">
          <ConnectionPanel
            connected={connected}
            accessCode={token}
            onAccessCodeChange={(value) => { setToken(value); setConnected(false); }}
            onConnect={connect}
            disabled={!config || !token}
          />
        </AnalysisSection>

        <form id="failure-form" onSubmit={assess}>
          <AnalysisSection id="input" eyebrow="Input" title="EV telemetry snapshot" description="Supply the supported measurements you have. Blank numeric fields remain explicitly missing and use the trained missing-value masks.">
            <fieldset className="analysis-input-group">
              <legend>Chemistry</legend>
              <div className="analysis-fields">
                <label className="analysis-field">Battery chemistry
                  <span className="analysis-field__help">Supported chemistry family</span>
                  <select value={values.battery_chemistry} onChange={(event) => setValues({ ...values, battery_chemistry: event.target.value })}>{["LFP", "LTO", "NCA", "NMC"].map((name) => <option key={name}>{name}</option>)}</select>
                </label>
              </div>
            </fieldset>
            {groups.map((group) => <fieldset className="analysis-input-group" key={group.title}>
              <legend>{group.title}</legend>
              <div className="analysis-fields">{group.fields.map((field) => <label className="analysis-field" key={field.name}>{field.label}<span className="analysis-field__help">{field.unit}</span><input type="number" step="any" value={values[field.name] ?? ""} placeholder="Missing" onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} /></label>)}</div>
            </fieldset>)}
            <p className="failure-note">No target, brand, manufacturer, derived health field, or unsupported modality is sent to the model.</p>
            <div className="analysis-actions">
              <AnalyzeButton type="submit" busy={busy} busyLabel="Assessing…">Assess failure risk</AnalyzeButton>
              <button className="btn btn--secondary" type="button" onClick={() => setValues(example)}>Load held-out example</button>
            </div>
          </AnalysisSection>
        </form>

        <AnalysisSection id="results" eyebrow="Results" title="Failure risk result" description="Review the probability together with the stored classification threshold.">
          {error && <AnalysisError>{error}</AnalysisError>}
          {!result
            ? <p className="analysis-empty">Results appear here once an assessment has completed.</p>
            : <PredictionResultCard>
              <div className="analysis-metric-grid">
                <MetricTile label="Failure probability" value={`${(result.failure_probability * 100).toFixed(1)}%`} unit="Snapshot classification probability" primary />
                <MetricTile label="Classification" value={result.failure_flag ? "Failure flag" : "No failure flag"} unit="Based on the stored decision threshold" />
                <MetricTile label="Decision threshold" value={`${(result.decision_threshold * 100).toFixed(1)}%`} unit="Model-selected classification cutoff" />
              </div>
              <div className="failure-meter" aria-label={`Failure probability ${(result.failure_probability * 100).toFixed(1)} percent`}><span style={{ width: `${result.failure_probability * 100}%` }} /></div>
              <ModelIdentity task="EV failure classification" modelVersion={result.model_version} modelSha256={result.model_sha256} activeExperts={result.active_experts} />
              <p className="failure-note">Interpret this snapshot estimate with engineering review. It does not predict when a failure could occur and does not certify the battery as safe.</p>
            </PredictionResultCard>}
        </AnalysisSection>
      </AnalysisPageShell>
    </main>
    <LandingFooter />
  </div>;
}
