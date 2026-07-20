import { StatusBadge } from "./StatusBadge";

interface ConnectionPanelProps {
  connected: boolean;
  accessCode: string;
  onAccessCodeChange: (value: string) => void;
  onConnect: () => void;
}

/**
 * Customer-facing wrapper around the unchanged pairing flow. The access code is
 * the pairing token, sent in the same header and stored the same way; only the
 * wording differs. The service address is supplied by configuration and is never
 * shown or editable here.
 */
export function ConnectionPanel({ connected, accessCode, onAccessCodeChange, onConnect }: ConnectionPanelProps) {
  return <div className="connect">
    <div className="connect__head">
      <h3 className="connect__title">Secure connection</h3>
      <StatusBadge tone={connected ? "healthy" : "warning"} label="Status">{connected ? "Connected" : "Disconnected"}</StatusBadge>
    </div>
    <p className="dash-hint">Enter your access code to connect securely. Your data is only sent once you are connected.</p>
    <div className="connect__form">
      <div className="field">
        <label className="field__label" htmlFor="access-code">Access code</label>
        <input id="access-code" type="password" autoComplete="off" value={accessCode} onChange={(event) => onAccessCodeChange(event.target.value)} />
      </div>
      <button type="button" className="btn btn--secondary" onClick={onConnect}>{connected ? "Reconnect" : "Connect"}</button>
    </div>
  </div>;
}
