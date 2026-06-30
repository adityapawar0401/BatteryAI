# BatteryAI

BatteryAI is a local-first deployment of the finalized Oxford Battery PIMoE checkpoint. It predicts next-observed-checkpoint state of health (SOH) and predictive standard deviation. Numerical inference runs in the supplied PyTorch environment; optional explanatory suggestions use the paired local service and native Ollama with exactly `llama3.2:3b`.

Start with [START_HERE.md](START_HERE.md). The static React application can be hosted on GitHub Pages and paired with the loopback-only local engine. The RUL head and Oxford-unsupported experts are deliberately unavailable.

## Repository map

- `apps/web`: React, TypeScript, Vite, browser-ONNX and paired-local provider boundaries and UI.
- `services/local_inference`: FastAPI service and the minimal copied model runtime.
- `packages/contracts`: canonical Oxford row schema.
- `packages/model_profiles`: model capabilities and limitations.
- `scripts`: Windows setup, verification, run, export and build commands.
- `tests`: Python runtime/API coverage; web tests live beside web source.
- `docs`: architecture, security and operational detail.

The supplied `_inputs`, `batteryai-gpu-env`, checkpoint and raw dataset remain untracked.

Ollama is optional and must be installed separately as a native Windows application. BatteryAI never installs it, uses no cloud LLM API or API key, and talks to it only through the loopback-only paired FastAPI service. Prepare the exact local model with `ollama pull llama3.2:3b`, or run **BatteryAI: Setup Local LLM** after Ollama itself is installed.
