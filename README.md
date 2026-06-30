# BatteryAI

BatteryAI is a local-first deployment of the finalized Oxford Battery PIMoE checkpoint. It predicts next-observed-checkpoint state of health (SOH) and predictive standard deviation. Numerical inference runs in the supplied PyTorch environment; optional explanatory suggestions run entirely in the browser through WebLLM.

Start with [START_HERE.md](START_HERE.md). The static React application can be hosted on GitHub Pages and paired with the loopback-only local engine. The RUL head and Oxford-unsupported experts are deliberately unavailable.

## Repository map

- `apps/web`: React, TypeScript, Vite, ONNX/WebLLM provider boundaries and UI.
- `services/local_inference`: FastAPI service and the minimal copied model runtime.
- `packages/contracts`: canonical Oxford row schema.
- `packages/model_profiles`: model capabilities and limitations.
- `scripts`: Windows setup, verification, run, export and build commands.
- `tests`: Python runtime/API coverage; web tests live beside web source.
- `docs`: architecture, security and operational detail.

The supplied `_inputs`, `batteryai-gpu-env`, checkpoint and raw dataset remain untracked.
