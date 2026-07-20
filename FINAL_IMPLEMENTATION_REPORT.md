# BatteryAI final implementation report

## Client-facing content and confidentiality cleanup — 2026-07-20

### Scope

Presentation-layer cleanup so the public site reads as a finished product rather than an implementation report. No numerical inference, preprocessing, checkpoint loading, device selection, authentication, CORS, rate limiting, Tailscale, or GitHub Actions deployment behavior was changed. Internal values continue to flow through the API exactly as before; they are simply no longer presented.

### Client-facing sections removed

Landing page: Architecture (the four-stage chain and the "what that means" facts), Model capabilities (capability matrix, active experts, target), and Technical limitations (model and deployment lists). Dashboard: the entire System Status panel, the backend-mode selector, the service-endpoint field, the checkpoint-hash row and its details disclosure, and the device/provider rows.

### Client-facing sections retained or added

Landing: navigation, hero, product value, how it works, benefits, dashboard CTA, minimal footer. Dashboard: Overview (secure connection, progress, latest result), Data, Validation, Results, Insights.

### Internal terms removed from the visible UI

Oxford, Oxford V1, Battery-PIMoE, active experts, masked experts, model profile, checkpoint, checkpoint SHA-256, Ollama, llama3.2:3b, local LLM, browser ONNX, CUDA/CPU device, loopback, remote/local deployment mode, the backend and Funnel URLs, host-computer and GitHub Pages explanations, RUL availability, and the next-observed-checkpoint horizon. The field-help descriptions in both copies of the input schema were rewritten (they previously read "Oxford curve modality" and "converted from Oxford mAh"); field names, types, units and every validation rule are unchanged. Both page `<meta name="description">` tags were rewritten — the confidentiality scan caught them, and they are public in search results and link previews.

Field names the workflow genuinely requires — `source_checkpoint`, `target_checkpoint`, `modality`, `capacity_Ah` and the rest — remain visible, because users need them to prepare a valid file.

### Connection terminology

"Pair the host engine" → "Connect"; "pairing token" → "Access code"; "paired/unpaired" → "Connected/Disconnected"; reconnect replaces re-pair. The service address is supplied by configuration, is never rendered, and is not editable. Internally the flow is byte-for-byte the same: the same `X-BatteryAI-Token` header, the same `/v1/capabilities` probe, the same `sessionStorage` key, and the same refusal to send anything before an explicit connect.

### Insights terminology

"AI-generated suggestions" → "AI Insights"; "Cautions" → "Considerations"; "Actions" → "Recommended actions". Provider and model labels, the Ollama corrective command, and the "completed locally" timing text are gone. The response contract (`summary`/`actions`/`cautions`) and its validation are unchanged.

### Generated-output confidentiality

The leak was structural: the whole summary — including `model_profile`, `model_sha256`, `active_experts` and a `limitations` list containing "RUL unavailable" and "next-observed-checkpoint horizon varies" — was serialized into the prompt, so the model echoed it back ("Battery prediction data for Oxford-v1 model"). Two layers now prevent that:

1. **Prompt payload narrowed** (`ollama.py`): only `predicted_soh`, `predictive_std`, `actual_soh`, `absolute_error` and `input_quality` reach the model. The HTTP request contract, the strict `SuggestionSummary` validation, the structured-output schema, the Python validation and the bounded retry are all untouched — the endpoint still accepts exactly the same body.
2. **System prompt rewritten** to forbid naming any model, provider, dataset, checkpoint, component, device, deployment or unavailable feature, without seeding internal vocabulary into the instruction itself.
3. **Frontend guard** (`clientText.ts`) as defense in depth: any generated entry that still carries an internal term is dropped, and a leaking summary is replaced with an equivalent product-level statement. Numbers are never touched.

Verified against the real model on this machine: it previously produced "Battery prediction data for Oxford-v1 model"; it now returns clean customer-facing text with zero internal terms.

### Error messages

Service failures are translated for display while the detailed originals continue to reach the service logs: rejected token → "The access code is invalid or has expired."; not connected → "Connect to the analysis service before running an analysis."; insight failures → "AI insights are temporarily unavailable."; rate limiting → "The analysis service is busy. Wait a moment and try again."; anything unrecognized that carries an internal term → "The analysis service is currently unavailable." CSV validation errors pass through verbatim, because users need them to fix their file.

### Exact components changed

- Added: `src/clientText.ts` (+ tests), `src/dashboard/ConnectionPanel.tsx`, `src/dashboard/ResultsSection.tsx`.
- Removed: `src/dashboard/SystemStatusSection.tsx`, `src/dashboard/PredictionSection.tsx`, `src/ui/LimitationsPanel.tsx`.
- Rewritten: `src/landing/LandingPage.tsx`, `LandingNav.tsx`, `LandingFooter.tsx`, `src/dashboard/OverviewSection.tsx`, `DashboardHeader.tsx`, `src/llm/SuggestionPanel.tsx`.
- Edited: `src/dashboard/DashboardPage.tsx`, `DashboardSidebar.tsx`, `DataInputSection.tsx`, `ValidationSection.tsx`, `StatusBadge.tsx`, `src/llm/provider.ts` (limitation wording only), `src/styles/{components,dashboard}.css`, both `index.html` files, `packages/contracts/oxford-input-schema.json` and its served copy (descriptions only), `services/local_inference/batteryai_runtime/ollama.py` (prompt only), `scripts/build-pages.ps1` and `.github/workflows/pages.yml` (added a rendered-markup confidentiality scan).

### Verification

- Frontend: **94 tests in 14 files** pass; `npm run typecheck` clean.
- Python: **59 tests** pass, including two new ones asserting the prompt carries no internal identifiers and the system prompt forbids naming components.
- `scripts\test-all.ps1` prints `BATTERYAI_TEST_ALL=PASSED`.
- Default and remote production builds both emit `dist/index.html` and `dist/dashboard/index.html` and pass the artifact scan, which now also fails on any internal term in rendered markup.
- Browser review over 13 states (landing and dashboard, desktop 1440×900 and mobile 390×844, disconnected → connected → validated → results → insights → error): no internal term and no horizontal overflow anywhere. The insights check fed deliberately leaky generated output and confirmed the UI scrubbed it.
- **Numerical equivalence confirmed against the live engine**: a real inference over the 3,510-row example returned `predicted_soh` 97.06190490722656, `predictive_std` 8.065762519836426, `actual_soh` 98.67620878772155 and `absolute_error` 1.6143038804949867 — bit-identical to the recorded fixture. `engine.py`, `preprocessing.py`, `contracts.py`, `app.py` and `battery_pimoe/` are untouched.

### Remaining visible technical terms and why

`source_checkpoint`, `target_checkpoint`, `modality`, `point_index`, `sequence_id`, `cell_id`, `time_s`, `voltage_V`, `capacity_Ah`, `temperature_K` and `actual_soh` remain in the CSV help and validation output. They are the column names of the file the customer must supply; removing them would make a valid file impossible to prepare. `pp` (percentage points) remains as the uncertainty unit. Bundled JavaScript still contains API contract strings such as `oxford-v1` and the configuration filenames, which the application requires to function; the requirement is that they never reach the rendered experience, and the markup scan plus the browser review confirm they do not.

## Landing page and dashboard UI/UX revamp — 2026-07-17

### Scope

Frontend architecture and UI/UX only. The single-page `App.tsx` became two real static pages: a backend-free landing page and the existing application as a dashboard. No Python, model, checkpoint, preprocessing, inference, pairing, CORS, rate-limiting, Ollama or Funnel behavior was touched.

| | Public URL | Local development | Artifact |
| --- | --- | --- | --- |
| Landing page | `https://adityapawar0401.github.io/BatteryAI/` | `http://localhost:5173/` | `dist/index.html` |
| Dashboard | `https://adityapawar0401.github.io/BatteryAI/dashboard/` | `http://localhost:5173/dashboard/` | `dist/dashboard/index.html` |

### Routing and base path

A Vite multi-page build emits two real HTML entries, so `/BatteryAI/dashboard/` is a static file and direct navigation plus browser refresh cannot produce a Pages 404. No SPA fallback or `404.html` redirect is involved. The build base is absolute and defaults to `/BatteryAI/` (override with `BATTERYAI_PAGES_BASE`); the dev server uses `/`. Every internal link and runtime asset URL is derived from the Vite base via `apps/web/src/routes.ts`; nothing hard-codes `/`, `/dashboard/` or a domain-root asset path.

### Exact files changed

- Added: `apps/web/dashboard/index.html`, `src/dashboard-main.tsx`, `src/routes.ts`, `src/ui/useOverlayDismiss.ts`, `src/ui/LimitationsPanel.tsx`, `src/styles/{tokens,components,landing,dashboard}.css`, `src/landing/{LandingPage,LandingNav,LandingFooter,NeuralBackdrop,Reveal,CursorHalo}.tsx`, `src/dashboard/{DashboardPage,DashboardSidebar,DashboardHeader,StatusBadge,OverviewSection,DataInputSection,ValidationSection,PredictionSection,SystemStatusSection,DataSeriesChart}.tsx`, `src/dashboard/summary.ts`, `docs/design-references/README.md`.
- Changed: `apps/web/index.html`, `src/main.tsx`, `vite.config.ts` (base + MPA inputs), `src/test-setup.ts` (jsdom canvas/matchMedia shims), `src/llm/SuggestionPanel.tsx` (class names, section id and eyebrow only — logic, labels, roles and validation unchanged), `.github/workflows/pages.yml`, `scripts/build-pages.ps1`, `README.md`, `START_HERE.md`, `docs/architecture.md`, `docs/github-pages.md`.
- Removed: `apps/web/src/App.tsx` and `src/styles.css`, superseded by `DashboardPage` and the scoped stylesheets. Also `apps/web/vite.config.js` and `vite.config.d.ts` — see below.
- Moved: `landingpage.txt` and `dashboard.txt` to `docs/design-references/`; they are non-runtime references, are never bundled, and the build fails if either reaches `dist`.
- Tests added: `src/routes.test.ts`, `src/landing/LandingPage.test.tsx`, `src/dashboard/DashboardPage.test.tsx`, `src/dashboard/DataSeriesChart.test.tsx`, `src/dashboard/summary.test.ts`. `src/App.remote.test.tsx` moved to `src/dashboard/DashboardPage.remote.test.tsx` with its assertions unchanged.

### Preserved behavior

`DashboardPage` holds the state and provider ownership that `App.tsx` had, with one provider instance each for local HTTP inference, browser ONNX and local Ollama suggestions. CSV upload, paste, editable table, supplied example, validation rules and messages, backend selection, pairing, cancellation, export, `sessionStorage`-only token, remote-mode Funnel lock, and the suggestion panel's readiness, retry, cancellation and schema rejection are unchanged. Added state is limited to presentation: mobile navigation open/closed and a `validated` flag for the validation status badge.

### Accuracy of content

The landing page renders the active experts, target, browser-ONNX reason and model limitations from `public/config/oxford-v1.json` at build time, plus deployment-level limitations shared with the dashboard's System Status. The design references' 99.8% accuracy claim, `Transformer-V4.2` label, adaptive-charging and thermal-optimization features, live data stream, system-health percentage, KPI tiles, 48-cell pack visualization, deployment-request form, fake social links and CDN Tailwind script are excluded; tests and the artifact scan assert their absence. Charts are drawn only from supplied rows using deterministic evenly-spaced downsampling that keeps the first and last point, and they disclose the sampling in an accessible summary.

### Defects found and fixed during review

- The `.dash-body` grid took a min-content floor from the wide editable table, stretching every section past the viewport where `overflow-x: hidden` silently clipped it. Fixed with `min-width: 0` on the grid items so the table scrolls inside `.table-wrap`.
- A wrapping `<label>` folded the option text into the backend select's accessible name (`BackendAutoBrowserHost`). Fixed with explicit `htmlFor`/`id` association and covered by a test.
- Chart bounds rendered side by side, reading as an x-axis range. Fixed to y-axis ticks at the top and bottom of the plot with a labelled x-axis.
- The mobile header truncated the backend URL to `http…`. The endpoint badge is now hidden below 900px, where System Status and the prediction form still show it in full.
- A blanket `.landing > *:not(.landing__backdrop) { position: relative }` stacking rule outranked both the nav's `position: sticky` and the skip link's `position: absolute`. The landing nav therefore scrolled away instead of sticking, and the skip link stayed in flow as a 26px phantom gap above the nav. Replaced with targeted stacking on the content wrappers only.
- `overflow-x: hidden` on the root made it a scroll container, which broke `position: sticky` for both the landing nav and the dashboard header, and hid layout overflow instead of surfacing it — it was what masked the grid defect above. Removed; the 21 layout assertions now pass with no clipping net in place, so the absence of horizontal overflow is measured rather than concealed.
- jsdom has no canvas or `matchMedia`, so the landing backdrop emitted a jsdom error on stderr, which `scripts/test-web.ps1` treats as fatal. Shimmed in `src/test-setup.ts`.
- `apps/web/vite.config.js` and `vite.config.d.ts` were tracked, stale compiled copies of the previous `vite.config.ts` (`base: "./"`, single entry) that nothing referenced and `tsc -b` cannot regenerate, since `tsconfig.node.json` sets `noEmit`. Vite resolves `vite.config.js` ahead of `vite.config.ts`, so a bare `vite build` silently produced a single-page relative-base artifact with no `dashboard/index.html`, which would 404 on Pages. Verified by reproducing it, then removed; a bare `vite build` now emits both entries at the `/BatteryAI/` base. The repository scripts and workflow were never affected because they pass `--config vite.config.ts` explicitly.

### Verification

- Frontend: 78 tests in 13 files pass; `npm run typecheck` clean.
- Python: 57 tests pass, unchanged and untouched.
- `scripts\test-all.ps1` prints `BATTERYAI_TEST_ALL=PASSED`.
- Default Pages build and remote build with `BATTERYAI_REMOTE_API_URL=https://laptop-lr3kmrfv.taild8c2e6.ts.net` both emit `dist/index.html` and `dist/dashboard/index.html` and pass the artifact scan. The configured Funnel URL appears only in the dashboard chunk, never in the landing chunk.
- Static routing proved against a strict static server with no SPA fallback: `/BatteryAI/` and `/BatteryAI/dashboard/` return 200 from real files while an unknown path returns 404, confirming no fallback is masking the result.
- Local development verified end to end: landing → dashboard → refresh → back to landing, with no page errors.
- Browser review at 1440×900 and 390×844 over 20 screenshots and 21 layout assertions: no horizontal overflow and no clipped content in any state, including long errors and long LLM suggestions. The assertions measure element rectangles against the viewport and ignore content that scrolls inside its own container, and they run with no root `overflow-x: hidden`, so nothing is concealed. Reduced motion disables the reveal animation and never mounts the pointer halo, which is also absent on coarse pointers. Both sticky headers verified to hold at scroll offset, and the skip link verified reachable and on-screen on first Tab on both pages.
- Landing sections use scroll reveal, so all 20 revealed blocks were confirmed to reach full opacity on scroll and via every nav anchor. Content is always in the DOM and is shown immediately when `IntersectionObserver` is unavailable or reduced motion is requested, so it can never be permanently hidden.
- Local engine unaffected: `/health` reports running and `/v1/capabilities` returns 401 unauthenticated.

### Remaining blocker

The public Funnel leg of `scripts\check-remote.ps1` could not be exercised. Tailscale reports `BackendState: Running` with `DNSName: laptop-lr3kmrfv.taild8c2e6.ts.net`, matching the configured `BATTERYAI_REMOTE_API_URL` exactly, but `tailscale funnel status` reports `No serve config`, so no Funnel is currently active and `https://laptop-lr3kmrfv.taild8c2e6.ts.net/health` is unreachable. No Funnel configuration was started or altered. Re-run **BatteryAI: Start Remote** and then `scripts\check-remote.ps1` to complete that check. This is a deployment-state gap, not a frontend defect: the remote build, the ts.net URL lock and the pre-pairing request restrictions are all verified.

Separately, the `origin` remote is `https://github.com/adityapawar0401/deployment.git`, which does not match the documented `BatteryAI` repository. The base path defaults to `/BatteryAI/` as specified and is overridable with `BATTERYAI_PAGES_BASE`. No remote was changed. The footer omits a GitHub repository link because project metadata does not agree on the correct URL.

## Incomplete-suggestions defect correction — 2026-06-30

### Root cause

`SuggestionContent.actions` and `SuggestionContent.cautions` previously used `Field(max_length=5)` without `min_length`. Pydantic therefore generated `maxItems` but no `minItems` in the exact schema sent to Ollama, and the same Python model accepted `[]`. The shared `BoundedText` used `min_length=1`, but validation occurred before any trimming, so whitespace-only strings also counted as non-empty. The frontend mirrored those permissive zero-to-five bounds and rendered headings unconditionally. That is why a genuine HTTP 200 response could contain an empty Actions list and still be treated as completed.

### Correction and retry behavior

- The generated Ollama JSON Schema and Python model now both require a trimmed non-empty summary, one to four actions, one to four cautions, non-empty strings, bounded string lengths, and no additional properties.
- Surrounding whitespace is trimmed. No list entry is removed or repaired silently; blank/non-string entries and excess items are rejected.
- The fixed prompt normally requests two to four concrete monitoring/review actions and one to four cautions while retaining a hard minimum of one. It continues to forbid RUL estimates, safety certification, numerical overrides, invented data, raw rows, and arbitrary prompts.
- Syntactically valid JSON that fails typed suggestion-content validation receives at most one retry. The retry uses the identical bounded prediction summary and one fixed corrective system instruction. It does not include raw rows, paths, the pairing token, or the raw failed completion.
- Malformed JSON, missing response content, network failures, timeouts, cancellation, authentication, rate limits, and other service errors are not retried. A second invalid completion returns HTTP 502 code `incomplete_suggestions`; incomplete content never returns HTTP 200.
- The browser validates the same one-to-four-item contract. `SuggestionPanel` validates again before storing completion, never renders empty Actions/Cautions headings, displays the structured error, preserves the numerical result, and leaves **Generate suggestions** usable.

### Exact files changed

- `services/local_inference/batteryai_runtime/ollama.py`
- `tests/python/test_ollama.py`
- `tests/python/test_remote_deployment.py` (test fixture updated to the stricter suggestion contract only)
- `apps/web/src/llm/schema.ts`
- `apps/web/src/llm/schema.test.ts`
- `apps/web/src/llm/provider.test.ts`
- `apps/web/src/llm/SuggestionPanel.tsx`
- `apps/web/src/llm/SuggestionPanel.test.tsx`
- `docs/local-llm.md`
- `FINAL_IMPLEMENTATION_REPORT.md`

### Verification

- Targeted Ollama Python tests: **26 passed**.
- Targeted frontend LLM tests: **20 passed**.
- Final Python suite: **57 passed, 0 failed**.
- Final frontend suite: **38 passed, 0 failed across 8 files**.
- TypeScript: **passed**.
- `scripts/test-all.ps1`: **passed**.
- Production GitHub Pages build and static artifact scan: **passed**.
- Numerical CUDA regression and finalized checkpoint SHA-256: **passed and unchanged**.
- Local and configured-remote frontend providers use the identical protected `/v1/suggestions` contract; deterministic tests cover both origins.

One genuine protected `/v1/infer` → `/v1/suggestions` run used the finalized Oxford fixture and local `llama3.2:3b`. It returned HTTP 200 only with **3 populated actions** and **2 populated cautions**. Redacted response:

```json
{
  "provider": "ollama",
  "model": "llama3.2:3b",
  "suggestions": {
    "summary": "Battery Health: Cautionary Review",
    "actions": ["[redacted concrete action]", "[redacted]", "[redacted]"],
    "cautions": ["[redacted caution]", "[redacted]"]
  }
}
```

The four authoritative numerical fields before and after generation were identical. No Battery-PIMoE, checkpoint, Oxford preprocessing, numerical inference/schema, CUDA/CPU behavior, deployment/Tailscale, pairing, CORS, rate-limit, `llama3.2:3b`, browser ONNX, `_inputs`, or model-artifact implementation file changed.

## Stable remote deployment finalization — 2026-06-30

This section is the authoritative final result for the remote-deployment change and supersedes the older baseline counts later in this report.

### Scope and architecture

Added an explicit, default-off `BATTERYAI_REMOTE_MODE=1` deployment layer: GitHub Pages remains a static frontend, one exact configured HTTPS `*.ts.net` Tailscale Funnel origin reaches FastAPI, and FastAPI continues to bind only to `127.0.0.1:8000`. The browser never contacts Ollama. No router, firewall, model, checkpoint-loading, Oxford preprocessing, device selection, fallback, expert masking, numerical schema, prediction schema, input workflow, Ollama prompt/model, browser ONNX policy, `_inputs`, raw data, or GPU-environment behavior was changed.

Numerical inference is unchanged: no numerical engine, preprocessing, copied Battery-PIMoE, model-profile, checkpoint, scaler, adapter, contract, or fixture file changed. The finalized SHA-256 remains `1d070a4d3e9a8fd3883b7e9110bd9e68226ff98cc0e9692c961286cdb053b610`; remote-mode local smoke reported device `cuda` and that exact hash.

### Exact files changed

- Deployment configuration/security: `configs/deployment.json`, `configs/deployment.schema.json`, `services/local_inference/deployment.py`, `services/local_inference/app.py`, `tests/python/test_remote_deployment.py`.
- Public frontend configuration/provider/UI/tests: `configs/app.json`, `configs/app.schema.json`, `apps/web/public/config/app.json`, `apps/web/src/config.ts`, `apps/web/src/config.test.ts`, `apps/web/src/inference/local.ts`, `apps/web/src/inference/local.test.ts`, `apps/web/src/llm/provider.ts`, `apps/web/src/App.tsx`, `apps/web/src/App.remote.test.tsx`.
- Build/workflow metadata: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/vite.config.js`, `apps/web/tsconfig.app.tsbuildinfo`, `apps/web/tsconfig.node.tsbuildinfo`, `.github/workflows/pages.yml`.
- Windows operation: `scripts/start-remote.ps1`, `scripts/stop-remote.ps1`, `scripts/check-remote.ps1`, `scripts/build-pages.ps1`, `scripts/test-web.ps1`, `.vscode/tasks.json`.
- Documentation/reporting: `docs/remote-deployment.md`, `README.md`, `START_HERE.md`, `FINAL_IMPLEMENTATION_REPORT.md`.

### Security and resource results

- Remote URL validation accepts only one exact HTTPS `*.ts.net` origin and rejects credentials, query, fragment, path, custom port, non-HTTPS, and non-Tailscale hosts. The production UI locks this origin; local mode retains loopback endpoint controls.
- CORS uses exact configured GitHub Pages and explicit loopback development origins. There is no wildcard or origin regex.
- A fresh random pairing token is still created on every process start, checked with `secrets.compare_digest`, required for model details, inference, LLM capabilities, and suggestions, and stored by the browser only in `sessionStorage`. No backend request occurs before explicit pairing.
- Remote Swagger, ReDoc, and OpenAPI are disabled. Authenticated API responses use `Cache-Control: no-store`; API security headers include `nosniff`, no-referrer, CSP `frame-ancestors 'none'`, and a restrictive permissions policy.
- Numerical and suggestion capacity default to one active request each. Excess work is rejected immediately with structured HTTP 429 rather than queued. A configurable per-client/token sliding-window rate limit and configurable request timeouts are active.
- Ollama remains strictly loopback-only. The new layer persists neither inputs nor generated results and adds no payload/prompt logging.

### Final verification

- `scripts/test-all.ps1`: **passed**.
- Python: **48 passed, 0 failed**. This includes unchanged numerical regression, real checkpoint/adapter behavior, CUDA, auth, exact CORS, remote docs suppression, rate limiting, concurrency rejection, structured 429, URL validation, private-file non-serving behavior, and Ollama-unavailable startup behavior.
- Frontend: **30 passed, 0 failed across 8 files**. This includes the locked GitHub Pages Funnel provider, no pre-pair backend request, strict build/public configuration, session pairing, and unchanged inference/suggestion behavior.
- TypeScript: **passed**.
- Default/local GitHub Pages production build: **passed**.
- Remote GitHub Pages production build with `https://battery.example.ts.net`: **passed**; repository-subpath-safe relative asset build retained.
- Remote build with a missing URL: **correctly rejected** with `Remote production build requires an exact HTTPS ts.net VITE_BATTERYAI_REMOTE_API_URL.`
- Static artifact scan: **passed**; no token, `model.pt`, `.mat`, ONNX model, `_inputs`, GPU environment, local report, raw dataset name, or absolute user path was found.
- Local remote-mode smoke without public exposure: **passed**; health 200, unauthenticated capabilities 401, authenticated capabilities 200, remote docs 404, device CUDA, exact finalized checkpoint hash.
- Local CUDA regression: **passed** in the full Python suite and remote-mode smoke.
- Local Ollama regression: **passed** against Ollama/API `0.30.11`, exact `llama3.2:3b`, genuine structured generation, and GPU placement.

### Funnel and Pages result

Tailscale readiness: **not installed on this host** (`tailscale.exe` not found). Therefore no public Funnel was opened, no actual Funnel smoke test was possible, and there is no stable public backend URL to report yet. The scripts never install Tailscale automatically.

GitHub Pages requires the repository Actions variable `BATTERYAI_REMOTE_API_URL` set to the host's eventual exact `https://MACHINE.TAILNET.ts.net` Funnel origin. On the host, set the same `BATTERYAI_REMOTE_API_URL` plus `BATTERYAI_ALLOWED_FRONTEND_ORIGINS=https://USERNAME.github.io`.

First manual action: install Tailscale, sign in/connect it, and complete any tailnet Funnel enablement requested by the installed CLI. Then set the two public environment values above, set the matching GitHub repository variable, and run **BatteryAI: Start Remote** followed by **BatteryAI: Check Remote Deployment**. The launcher prints the new pairing token; share it privately and never place it in GitHub configuration.

## Completion

BatteryAI is implemented as a React/Vite static application, a loopback-only FastAPI/PyTorch engine, shared model/input contracts, a minimal copied deployment runtime, real Oxford fixture generation, a genuine ONNX export attempt, paired local-Ollama suggestions, Windows scripts, VS Code tasks, tests, documentation and a GitHub Pages workflow.

Repository structure:

```text
apps/web/                         React UI, providers, tests, static config/fixtures
services/local_inference/        FastAPI service, typed contracts, preprocessing, numerical engine, Ollama client
services/local_inference/battery_pimoe/  copied source runtime modules and source license
packages/contracts/              Oxford V1 JSON Schema
packages/model_profiles/         Oxford V1 capability profile
configs/                         validated app configuration and schema
scripts/                         setup, preflight, run, export, test and build scripts
tests/python/                    runtime, API and end-to-end integration tests
docs/                            architecture, contracts, security and operational reports
.github/workflows/               GitHub Pages build/deploy
.vscode/tasks.json               all requested BatteryAI tasks
```

## Preflight and checkpoint

- Required checkpoint, checksum, manifests, registries, preprocessing state, source snapshot and raw Oxford dataset were found.
- `model.pt` size: 167,947,919 bytes.
- Verified SHA-256: `1d070a4d3e9a8fd3883b7e9110bd9e68226ff98cc0e9692c961286cdb053b610`.
- Checkpoint: dictionary with model, optimizer/scheduler, configuration, metrics, metadata and preprocessing keys; not TorchScript.
- Strict checkpoint loading passed for all 273 state entries and 19,508,239 parameters.
- Copied source provenance commit: `7314f7674924b66df88c5ad848f60f2ea1357398`.
- Active experts: `core_operational`, `diagnostic_curve`, `usage_aging`, `residual`; all six unsupported experts are masked with zero routing weight.
- RUL is untrained and unavailable.

## Actual input and output contract

Canonical CSV rows contain sequence/cell identity, source and target checkpoint, Oxford modality, contiguous point index, time in seconds, voltage in volts, capacity coordinate in ampere-hours, temperature in kelvin and optional actual SOH. ICA and DVA are deterministically derived with the adapter's first-difference rules. Oxford current is unavailable and masked.

The real fixture contains 3,510 supplied Oxford `Cell1` C1-charge points for `cyc0000 -> cyc0100`; actual target SOH is `98.67620878772155%`. CPU inference produced `97.06190490722656%` predicted SOH with `8.065762519836426` percentage-point predictive standard deviation.

The fixture is a software-integrity example from a final-training cell, not an unbiased performance estimate.

## Backend status

Browser ONNX ML: **Unavailable for Oxford V1.** The real `torch.onnx.export(dynamo=True)` attempt stopped during graph capture on the history transformer's data-dependent causal-mask guard (`Eq(u0, 1)`). No ONNX file was retained. The frontend contains a real lazy ONNX Runtime Web provider, but the Oxford profile keeps it disabled until export, dynamic batch/sequence parity, browser loading and asset gates all pass.

Local ML: **Available on CUDA and CPU.** Actual CUDA inference passed on the NVIDIA GeForce GTX 1650 and returned the same prediction and uncertainty as CPU. Auto prefers CUDA and retries one CUDA out-of-memory failure on CPU when enabled. The local client rejects non-loopback endpoints and requires the engine checkpoint hash to match the configured finalized profile before inference.

Local suggestions: **Available through paired BatteryAI + native Ollama.** The strictly configured provider is `ollama`, endpoint `http://127.0.0.1:11434`, and exact model `llama3.2:3b`. The browser never contacts Ollama; the existing pairing-token-protected FastAPI service checks reachability/model installation and sends only a bounded prediction summary. Ollama receives the exact output JSON Schema, and Python validates the returned JSON again. There is no cloud fallback, API key, automatic pull, numerical override field or raw-row/prompt input.

## Security and privacy

The local engine binds to `127.0.0.1`, generates a cryptographically random startup token, requires the custom token header for inference/model details and suggestions, uses credential-free CORS, stores the token in browser `sessionStorage`, and does not persist or normally log battery payloads or suggestion summaries. Auto never sends rows to local HTTP before successful pairing. Ollama configuration rejects non-loopback hosts, HTTPS, credentials, query strings and API paths.

## Verification

Post-replacement verification executed in this implementation session:

- Preflight/checksum: passed.
- Python: 48 passed in the final suite, including every numerical and local-Ollama baseline test plus the remote deployment protections listed above.
- Frontend: 30 passed across eight files in the final aggregate run, including every numerical/provider and paired local-LLM baseline test plus the remote production shell.
- TypeScript: passed.
- Production Vite/GitHub Pages build: passed after WebLLM dependency/worker removal; root `index.html` present.
- Static artifact scan: no `model.pt`, `.mat`, `.onnx`, `_inputs`, supplied environment, local report, pairing-token text, raw dataset name, or absolute user path.
- Production-code scan: no unresolved TODO/FIXME, placeholder, dummy, fake, or machine-specific absolute path occurrence.

The final aggregate `scripts\test-all.ps1` rerun passed after the remote deployment implementation: preflight, 48 Python tests, TypeScript, 30 frontend tests, production build, and static artifact scan all completed successfully.

The production build no longer emits the previous 6.03 MB WebLLM worker or 5.91 MB WebLLM runtime chunk (nor its 7.00 MB source map). Current `dist` is 29,842,444 bytes, dominated by ONNX Runtime Web assets that remain intentionally unchanged. Static scanning found no WebLLM identifiers, checkpoint, Oxford `.mat`, `_inputs` or supplied Python environment.

## Local Ollama replacement verification

- Ollama version and local API version: `0.30.11`.
- Exact installed model: `llama3.2:3b`.
- Local API: `http://127.0.0.1:11434`.
- `scripts\check-ollama.ps1`: passed.
- Real structured-output smoke test: passed; Ollama reported GPU placement after the request.
- Real end-to-end suggestion: the genuine 3,510-row Oxford fixture ran through Battery-PIMoE on CUDA, then its bounded summary was posted through protected `/v1/suggestions` to real Ollama. HTTP 200 returned exact `summary/actions/cautions`; service timing was about 7.21 seconds.
- Numerical immutability: before and after suggestion generation remained exactly `(97.06190490722656, 8.065762519836426, 98.67620878772155, 1.6143038804949867)`.

Changed suggestion files: `configs/ollama.json`, `configs/ollama.schema.json`, `services/local_inference/batteryai_runtime/ollama.py`, `services/local_inference/app.py`, `tests/python/test_ollama.py`, `apps/web/src/llm/provider.ts`, `apps/web/src/llm/SuggestionPanel.tsx`, `apps/web/src/llm/schema.ts`, their frontend tests, `apps/web/src/App.tsx`, application configuration/schema copies, `scripts/check-ollama.ps1`, `scripts/setup-ollama-model.ps1`, `scripts/smoke-ollama.ps1`, `.vscode/tasks.json`, `package.json`, `package-lock.json`, and the LLM-related documentation listed below. Deleted obsolete files: `apps/web/src/workers/webllm.worker.ts`, `apps/web/src/llm/verified-models.ts`, and `docs/browser-llm.md`; added `docs/local-llm.md`. Numerical model, preprocessing, inference provider, profiles and `_inputs` were not changed.

## Operation

First run **BatteryAI: Setup** from **Tasks: Run Task** in VS Code. Then run **BatteryAI: Test All**, **BatteryAI: Start Local Inference**, and **BatteryAI: Start Web**. Copy the token printed by the local task into the Pair local engine controls.

For optional suggestions, install native Windows Ollama separately. Then explicitly run **BatteryAI: Setup Local LLM** (`ollama pull llama3.2:3b`) and **BatteryAI: Check Local LLM**. With the BatteryAI service paired and a prediction complete, the suggestions panel checks readiness and enables **Generate suggestions**.

Equivalent commands:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
powershell -ExecutionPolicy Bypass -File scripts\test-all.ps1
powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1 -Device auto
powershell -ExecutionPolicy Bypass -File scripts\start-web.ps1
powershell -ExecutionPolicy Bypass -File scripts\check-ollama.ps1
```

Browser-export dependencies are separated in `requirements-export.txt`; the export task gives the exact install command if they are absent.

## Known limitations and blockers

The genuine browser ONNX export limitation is documented above. It does not block local CUDA/CPU prediction, static hosting, input validation or paired local-Ollama suggestions. Ollama may choose GPU, CPU or mixed placement; a 4 GB GTX 1650 can make first load slow or resource-constrained. A live Ollama stop/restart was not forced during implementation to avoid interrupting the separately managed native application; unavailable/recovery behavior has mocked local-HTTP coverage. The only remote-deployment blocker is that Tailscale is not installed on this host, so a real Funnel URL and public-network smoke test remain manual. Production code contains no placeholders, mock predictions, fake generation or cloud fallback.

Manual retest: start Ollama, run `scripts\check-ollama.ps1`, start BatteryAI local inference and web UI, pair with the printed token, complete a CUDA prediction, confirm Local Ollama is `ready`, generate suggestions, verify the numerical cards do not change, rerun prediction and confirm the next request uses the new result. Stop/restart Ollama only when convenient, using **Check local LLM** to verify unavailable/recovery states.
