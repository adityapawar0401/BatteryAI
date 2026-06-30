# Local inference

Run `scripts\start-local.ps1 -Device auto -Port 8000`. The service binds only to `127.0.0.1`, prints a random token, verifies the model hash, prefers CUDA, and reports its actual device. `-Device cuda` requires CUDA; `-Device cpu` forces CPU.

Authenticated endpoints are `/v1/capabilities`, `/v1/model-profile`, `/v1/input-schema`, `/v1/infer`, `/v1/llm-capabilities`, and `/v1/suggestions`. `/health` reveals only service status. `BATTERYAI_ARTIFACT_DIR` may select a compatible finalized artifact directory only inside this deployment repository; external and parent paths are rejected. Use `BATTERYAI_PAIRING_TOKEN` only when managed token injection is required. Payloads and suggestion summaries are not persisted or logged.

The browser refuses non-loopback endpoints and verifies that the paired engine reports the configured finalized checkpoint hash before battery rows can be sent. The runtime also verifies that the standalone Oxford scaler file exactly matches the preprocessing contract embedded in checkpoint metadata.

Ollama configuration lives in `configs/ollama.json`. Environment overrides are `BATTERYAI_OLLAMA_URL`, `BATTERYAI_OLLAMA_MODEL`, `BATTERYAI_OLLAMA_TIMEOUT_SECONDS`, `BATTERYAI_OLLAMA_KEEP_ALIVE`, `BATTERYAI_OLLAMA_NUM_CTX`, `BATTERYAI_OLLAMA_NUM_PREDICT`, `BATTERYAI_OLLAMA_TEMPERATURE`, and `BATTERYAI_OLLAMA_ENABLED`. Validation permits only loopback HTTP without credentials or API paths and only the model tag `llama3.2:3b`. Ollama absence never prevents numerical inference startup.
