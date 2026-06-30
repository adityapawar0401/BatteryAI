# Security and privacy

The inference service binds to loopback and is not available on the LAN. A cryptographically random token is generated at each server start unless explicitly supplied. Protected endpoints require `X-BatteryAI-Token`; CORS allows development loopback and GitHub Pages origins without cookies. The browser stores the token in `sessionStorage`, so it expires with the tab session.

Uploaded rows are held in browser memory and request memory only. They are not persisted by the service, included in normal logs, or sent to external inference APIs. Browser model asset downloads may contact model hosting, but the structured suggestion input stays in the WebLLM worker.

Editable local endpoints are validated as loopback HTTP before either capability checks or inference. Pairing also requires the engine checkpoint hash to match the configured Oxford V1 profile. CSV files larger than 5 MB are rejected before browser parsing.
