# Local inference

Run `scripts\start-local.ps1 -Device auto -Port 8000`. The service binds only to `127.0.0.1`, prints a random token, verifies the model hash, prefers CUDA, and reports its actual device. `-Device cuda` requires CUDA; `-Device cpu` forces CPU.

Authenticated endpoints are `/v1/capabilities`, `/v1/model-profile`, `/v1/input-schema`, and `/v1/infer`. `/health` reveals only service status. `BATTERYAI_ARTIFACT_DIR` may select a compatible finalized artifact directory only inside this deployment repository; external and parent paths are rejected. Use `BATTERYAI_PAIRING_TOKEN` only when managed token injection is required. Payloads are not persisted or logged.

The browser refuses non-loopback endpoints and verifies that the paired engine reports the configured finalized checkpoint hash before battery rows can be sent. The runtime also verifies that the standalone Oxford scaler file exactly matches the preprocessing contract embedded in checkpoint metadata.
