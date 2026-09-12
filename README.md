# BatteryAI

BatteryAI is a local-first deployment of the finalized combined Oxford + EV Failure Battery-PIMoE descendant. It provides snapshot EV battery-failure classification and preserves next-observed-checkpoint Oxford state-of-health (SOH) estimation with predictive standard deviation. Numerical inference runs backend-side in PyTorch; the browser never receives the checkpoint.

Production model: `oxford_ev_failure_v1_full`, SHA-256 `24f985e578fb8db4610a4019e0e894a4e151e1f888622057c4ef6b356f1647e2`, 19,541,971 parameters. Startup refuses any artifact manifest or model hash that does not match this selection.

Start with [START_HERE.md](START_HERE.md). The static React application can be hosted on GitHub Pages and paired through a stable Tailscale Funnel with the loopback-only local engine. Local mode remains the default; see [docs/remote-deployment.md](docs/remote-deployment.md) for remote setup. The RUL head and Oxford-unsupported experts are deliberately unavailable.

## Pages

| | Public URL | Local development |
| --- | --- | --- |
| Landing page | `https://adityapawar0401.github.io/BatteryAI/` | `http://localhost:5173/` |
| Dashboard | `https://adityapawar0401.github.io/BatteryAI/dashboard/` | `http://localhost:5173/dashboard/` |

The unified dashboard submits the leak-free operational snapshot to `POST /api/predict/failure` and the separate diagnostic curve contract to `POST /v1/infer`. The old `/failure/` URL redirects to `/dashboard/#failure-risk`. See [docs/ev-failure.md](docs/ev-failure.md) and [docs/input-contract.md](docs/input-contract.md).

There is **no login, sign-up, or account**. The dashboard still requires explicit pairing with your BatteryAI service using the pairing token it prints at startup; pairing is not a user login and the token stays in `sessionStorage` for that browser tab only. GitHub Pages serves static files only — the host computer runs the model, so it must stay online for remote use. See [docs/github-pages.md](docs/github-pages.md).

The public UI is deliberately customer-facing: it presents outcomes and workflow, and does not name the model, checkpoint, experts, device, LLM, hosting or deployment mode. Internally nothing changed — the pairing token is simply labelled "access code", and the service URL is used but not displayed. Technical detail lives in `docs/` and this repository, not on the website. See [docs/client-experience.md](docs/client-experience.md).

## Repository map

- `apps/web`: React, TypeScript, Vite static frontend (landing, unified battery dashboard, legacy redirect and contact).
- `services/local_inference`: FastAPI service and the minimal copied model runtime.
- `packages/contracts`: canonical Oxford row schema.
- `packages/model_profiles`: model capabilities and limitations.
- `scripts`: Windows setup, verification, run, export and build commands.
- `tests`: Python runtime/API coverage; web tests live beside web source.
- `docs`: architecture, security and operational detail. `docs/design-references` holds the non-runtime visual references.

The supplied `_inputs`, `batteryai-gpu-env`, checkpoints and raw datasets remain untracked. During development the service discovers the immutable sibling artifact; a deployment host may instead set `BATTERYAI_ARTIFACT_DIR` to a directory named `oxford_ev_failure_v1_full`. Other runtime variables are `BATTERYAI_DEVICE`, `BATTERYAI_REMOTE_MODE`, `BATTERYAI_REMOTE_API_URL`, `BATTERYAI_ALLOWED_FRONTEND_ORIGINS`, and `BATTERYAI_PAIRING_TOKEN` (normally generated at startup). Never put the pairing token in frontend configuration.

Development checks are `scripts/test-all.ps1` and `npm.cmd run build` from `apps/web`. Production remains GitHub Pages plus the loopback FastAPI service exposed through the configured Tailscale Funnel; pushing `main` triggers the existing Pages workflow.

Ollama is optional and must be installed separately as a native Windows application. BatteryAI never installs it, uses no cloud LLM API or API key, and talks to it only through the loopback-only paired FastAPI service. Prepare the exact local model with `ollama pull llama3.2:3b`, or run **BatteryAI: Setup Local LLM** after Ollama itself is installed.
