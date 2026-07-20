# BatteryAI

BatteryAI is a local-first deployment of the finalized Oxford Battery PIMoE checkpoint. It predicts next-observed-checkpoint state of health (SOH) and predictive standard deviation. Numerical inference runs in the supplied PyTorch environment; optional explanatory suggestions use the paired local service and native Ollama with exactly `llama3.2:3b`.

Start with [START_HERE.md](START_HERE.md). The static React application can be hosted on GitHub Pages and paired through a stable Tailscale Funnel with the loopback-only local engine. Local mode remains the default; see [docs/remote-deployment.md](docs/remote-deployment.md) for remote setup. The RUL head and Oxford-unsupported experts are deliberately unavailable.

## Pages

| | Public URL | Local development |
| --- | --- | --- |
| Landing page | `https://adityapawar0401.github.io/BatteryAI/` | `http://localhost:5173/` |
| Dashboard | `https://adityapawar0401.github.io/BatteryAI/dashboard/` | `http://localhost:5173/dashboard/` |

The landing page describes what BatteryAI does and contacts no backend. The dashboard is the application: data input, validation, analysis, results and AI insights.

There is **no login, sign-up, or account**. The dashboard still requires explicit pairing with your BatteryAI service using the pairing token it prints at startup; pairing is not a user login and the token stays in `sessionStorage` for that browser tab only. GitHub Pages serves static files only — the host computer runs the model, so it must stay online for remote use. See [docs/github-pages.md](docs/github-pages.md).

The public UI is deliberately customer-facing: it presents outcomes and workflow, and does not name the model, checkpoint, experts, device, LLM, hosting or deployment mode. Internally nothing changed — the pairing token is simply labelled "access code", and the service URL is used but not displayed. Technical detail lives in `docs/` and this repository, not on the website. See [docs/client-experience.md](docs/client-experience.md).

## Repository map

- `apps/web`: React, TypeScript, Vite two-page static frontend (landing + dashboard), browser-ONNX and paired-local provider boundaries and UI.
- `services/local_inference`: FastAPI service and the minimal copied model runtime.
- `packages/contracts`: canonical Oxford row schema.
- `packages/model_profiles`: model capabilities and limitations.
- `scripts`: Windows setup, verification, run, export and build commands.
- `tests`: Python runtime/API coverage; web tests live beside web source.
- `docs`: architecture, security and operational detail. `docs/design-references` holds the non-runtime visual references.

The supplied `_inputs`, `batteryai-gpu-env`, checkpoint and raw dataset remain untracked.

Ollama is optional and must be installed separately as a native Windows application. BatteryAI never installs it, uses no cloud LLM API or API key, and talks to it only through the loopback-only paired FastAPI service. Prepare the exact local model with `ollama pull llama3.2:3b`, or run **BatteryAI: Setup Local LLM** after Ollama itself is installed.
