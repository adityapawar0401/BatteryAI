# Security and privacy

The inference service binds to loopback and is not available on the LAN. A cryptographically random token is generated at each server start unless explicitly supplied. Protected endpoints require `X-BatteryAI-Token`; CORS allows development loopback and GitHub Pages origins without cookies. The browser stores the token in `sessionStorage`, so it expires with the tab session.

Uploaded rows are held in browser memory and request memory only. They are not persisted by the service, included in normal logs, or sent to external inference APIs. Suggestions use no cloud service: the browser sends only a bounded structured prediction summary to the pairing-token-protected BatteryAI endpoint, and BatteryAI alone contacts Ollama on loopback. Raw rows, curves, tokens and arbitrary prompts are rejected by the suggestion contract.

Editable local endpoints are validated as loopback HTTP before either capability checks or inference. Pairing also requires the engine checkpoint hash to match the configured Oxford V1 profile. CSV files larger than 5 MB are rejected before browser parsing.
