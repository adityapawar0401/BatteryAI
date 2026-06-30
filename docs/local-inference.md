# Local inference

Run `scripts\start-local.ps1 -Device auto -Port 8000`. The service binds only to `127.0.0.1`, prints a random token, verifies the model hash, prefers CUDA, and reports its actual device. `-Device cuda` requires CUDA; `-Device cpu` forces CPU.

Authenticated endpoints are `/v1/capabilities`, `/v1/model-profile`, `/v1/input-schema`, and `/v1/infer`. `/health` reveals only service status. Set `BATTERYAI_ARTIFACT_DIR` for another compatible finalized artifact directory and `BATTERYAI_PAIRING_TOKEN` only when managed token injection is required. Payloads are not persisted or logged.
