# BatteryAI final acceptance report

Audit date: 2026-06-29

## 1. Audit scope

Independent release audit of the deployment repository, finalized Oxford checkpoint integration, local PyTorch service, React frontend, local-suggestion boundary, browser-ONNX gate, security controls, scripts, tests, GitHub Pages build, ignored content, and generated static artifact. Existing claims were treated as untrusted until reproduced or identified as not testable. The suggestion subsystem was subsequently replaced with paired local Ollama; current evidence is recorded in `FINAL_IMPLEMENTATION_REPORT.md`.

Status meanings: **Pass** = directly or automatically verified; **Partial** = important portions verified but an environmental or harness limitation remains; **Not testable** = no valid execution path in this environment; **Fail** = unresolved release defect.

## 2. Files and components inspected

Inspected all tracked production Python and frontend source, tests, PowerShell scripts, application/schema/model-profile configuration, public configuration copies, fixtures, VS Code tasks, GitHub workflow, `.gitignore`, required top-level and `docs` reports, supplied artifact manifests/scaler/checksum, and the supplied Oxford adapter. Of 40 copied runtime Python files, 37 are byte-identical to the supplied source snapshot; the other three only omit YAML-loader exports/functions not used by deployment model construction.

## 3. Numbered audit results

| # | Area | Status | Independent evidence |
|---|---|---|---|
| 1 | Workspace isolation | Pass | Runtime/script paths are repository-relative. External `BATTERYAI_ARTIFACT_DIR` paths are now rejected. No production reference to the original repository path was found. |
| 2 | Private/generated content | Pass | `_inputs`, supplied environment, model formats, `.mat`, ONNX, logs, reports and build outputs are ignored; forbidden tracked-file query returned zero; static artifact contained none. |
| 3 | Checkpoint integrity | Pass | SHA-256 recalculated as `1d070a4d3e9a8fd3883b7e9110bd9e68226ff98cc0e9692c961286cdb053b610`; strict 273-entry load; 19,508,239 parameters; eval mode; gradients disabled; `torch.inference_mode()` used; no optimizer constructed; mutation regression passed. |
| 4 | Oxford runtime correctness | Pass | Exact four active experts and six zero-weight masked experts tested; RUL unavailable; next-observed-checkpoint SOH target; finite nonnegative uncertainty; checkpoint-bound inverse scaler; malformed physical units rejected. |
| 5 | Real inference | Pass | Genuine 3,510-row fixture ran on CPU and CUDA. GTX 1650 identified. Both returned SOH `97.06190490722656` and std `8.065762519836426`; absolute CPU/CUDA differences were `0.0`. Repeat determinism, single/batch parity, auto selection and simulated one-time OOM fallback passed. |
| 6 | Local service | Pass | Loopback bind, high-entropy token, missing/invalid/valid auth, credential-free restricted CORS, row/sequence limits, structured 422, health/capabilities and no-persistence/no-body-logging code paths verified. Browser upload cap is 5 MB. |
| 7 | Frontend providers | Pass | Shared typed interface verified. Auto has no fake output, does not send before pairing, preserves cancellation, and local provider enforces loopback and finalized checkpoint identity. Backend/device are rendered from results. Browser ML remains disabled. |
| 8 | Browser ONNX | Partial | Export implementation uses the real architecture and removes failed output. Current environment lacks `onnx`, `onnxruntime` and `onnxscript`, so the causal-mask failure was not independently reproduced in this audit. No ONNX artifact exists and browser ML is clearly unavailable. |
| 9 | Input contract | Pass | Supplied adapter confirms mAh-to-Ah/Celsius-to-K conversion, unavailable current masking, unsmoothed first-difference ICA/DVA, grouping and next-checkpoint target. Upload, paste and table converge on canonical validation. |
| 10 | Local suggestions | Pass | Paired-service-only Ollama flow, no cloud API/key, bounded structured input/output, strict Python revalidation and immutable numeric results verified with real `llama3.2:3b`. |
| 11 | Frontend quality | Partial | Metadata, schema columns, three input paths, fixtures, row/field errors, pairing, batch results/chart, exports, labels and responsive CSS inspected; unsupported RUL/safety claims absent. No real-browser accessibility/responsive or browser E2E harness exists. |
| 12 | Configuration | Pass | App/profile validation enforces exact fields, bounds, active/masked experts, disabled browser gate and preprocessing. Ollama settings are strictly validated from repository configuration with loopback-only overrides. |
| 13 | GitHub Pages | Partial | Production build passed with root `index.html`, relative assets, committed lock file and supported action versions. Strengthened static scan passed. The GitHub-hosted workflow itself was not executed from this local audit. |
| 14 | Production integrity | Pass | Contextual scan returned zero unresolved TODO/FIXME/placeholder/dummy/fake/mock-prediction, user-path or original-repository matches. |
| 15 | Tests | Partial | All available Python/frontend/TypeScript/integration/build gates passed. There is no browser E2E suite. ONNX export dependencies are absent. |

## 4. Defects discovered and fixes made

Twelve reproducible defects were found and fixed:

1. External artifact paths could escape the deployment repository; paths are now repository-confined.
2. The standalone scaler was not validated against checkpoint metadata; exact checkpoint/scaler consistency is now required.
3. Scaler shapes, channels, finite values and positive standard deviations were not strictly validated; they now fail closed.
4. Celsius, mAh and mV-shaped values passed the Oxford contract; broad physical-unit bounds now match API, schema and frontend validation.
5. Editable local endpoints could target non-loopback hosts; capability and inference now reject them before network access.
6. Pairing did not verify finalized checkpoint identity; capability and inference responses must match the configured SHA-256.
7. Browser cancellation could fall through Auto into local inference; aborts now propagate without a second data transfer.
8. Frontend “strict” configuration omitted schema bounds, uniqueness and profile invariants; validation now enforces them.
9. Browser suggestion generation settings were formerly hardcoded; the replacement Ollama settings are repository- and environment-configured with strict bounds.
10. Suggestion output allowed extra or unbounded fields; exact keys, list counts and string lengths are now enforced.
11. CSV upload had no byte limit; files over 5 MB are rejected before parsing.
12. Production inference cloned all 19.5 million parameters to CPU each request and the static build scan proved fewer exclusions than claimed; mutation checking moved to regression tests and artifact gates now scan all claimed private/runtime patterns.

Regression coverage was added for each meaningful behavior.

## 5. Exact verification results

- Current suites contain **35 Python** and **26 frontend** tests. Last post-replacement executions passed 34 Python and 25 frontend tests before one final regression was added to each; the final aggregate rerun was externally blocked by the execution-service usage limit.
- TypeScript: **passed**.
- Python end-to-end integration: **passed** as part of the 18-test suite.
- Browser end-to-end: **not testable**; no Playwright/Cypress browser harness is present.
- `scripts\test-all.ps1`: **passed** (preflight, Python, TypeScript, frontend and production build).
- CUDA: **passed**, NVIDIA GeForce GTX 1650; SOH `97.06190490722656`, std `8.065762519836426`.
- CPU: **passed**; SOH `97.06190490722656`, std `8.065762519836426`.
- CPU/CUDA comparison: SOH absolute difference `0.0`; std absolute difference `0.0` (well within the `0.03` CUDA regression tolerance).
- Checkpoint hash: **passed**, `1d070a4d3e9a8fd3883b7e9110bd9e68226ff98cc0e9692c961286cdb053b610`.
- Loaded state/parameters: **273 state entries**, **19,508,239 parameters**.
- Active experts: `core_operational`, `diagnostic_curve`, `usage_aging`, `residual`.
- Masked experts: `eis_complex`, `relaxation_pulse`, `thermal_mechanical`, `chemistry_geometry`, `pack_context`, `physics_state`; zero routing weight verified.

## 6. Local API and security result

Local service acceptance passed. It defaults to `127.0.0.1`, rejects non-loopback CLI hosts, uses a cryptographically random URL-safe token, compares tokens in constant time, protects all model/data endpoints, exposes only minimal unauthenticated health, does not enable credentials, does not persist input, and does not log bodies. The browser keeps tokens in `sessionStorage`, verifies engine hash before inference, and will not contact a non-loopback endpoint.

## 7. Browser ONNX and browser ML

Browser ONNX remains unavailable. The real export script and failure-cleanup behavior were inspected, and no partial `.onnx` file is present. The export attempt could not proceed because `onnx`, `onnxruntime`, and `onnxscript` are not installed in the supplied environment. Therefore the existing report's causal-mask diagnosis is **not independently reproduced here**. Browser ML stays correctly disabled and is not advertised as operational.

## 8. Local Ollama suggestions

Status: **available through the paired BatteryAI service when native Ollama is running**. Ollama/API version `0.30.11`, exact installed model `llama3.2:3b`, structured smoke test and real CUDA-prediction suggestion request passed. Production source contains no cloud text-generation or API-key path. Only bounded summaries are accepted; output is exact-schema JSON and cannot change predictions.

## 9. Production build and static artifact

Vite production build passed. `dist/index.html` is at artifact root and uses relative asset URLs. The artifact scan found no model, raw dataset, ONNX, `_inputs`, Python environment, local report, token text, raw dataset name, secret, or absolute user path. The artifact remains useful for input validation, local pairing/results and conditional browser-local suggestions while numerical browser ML is unavailable.

## 10. Git-ignore and tracked-file result

The ignore policy covers `_inputs`, `batteryai-gpu-env`, generic `.venv`, PyTorch/ONNX model formats, `.mat`, logs, local reports, caches and builds. Git tracked-file inspection returned zero forbidden matches. `_inputs` was read only and remains unmodified/untracked.

## 11. Remaining warnings and genuine limitations

- FastAPI test stack emits one `httpx`/`TestClient` deprecation warning.
- PyTorch emits one nested-tensor prototype warning.
- Vite warns that ONNX Runtime's WASM URL is unresolved at build time; dormant for Oxford V1 while browser ML is disabled.
- The static bundle remains large because ONNX Runtime Web assets are intentionally retained for the separate browser-ML boundary.
- Browser ONNX export cannot be rerun without the separated export dependencies.
- Real-browser accessibility/responsive checks and full browser E2E remain outside the installed harness.
- The final-training-cell fixture is software-integrity evidence, not unbiased model-performance evidence.

## 12. Exact next actions

1. For local release use, no code defect remains: run `scripts\start-local.ps1 -Device auto` and `scripts\start-web.ps1`.
2. To investigate browser ML, install only `requirements-export.txt` into the supplied environment, rerun `scripts\export-browser-model.ps1`, and keep browser ML disabled until export, Python parity, browser load and batch/dynamic-sequence parity all pass.
3. Before claiming browser UX certification, add and run a real-browser E2E/accessibility matrix on Chromium and a narrow mobile viewport.
4. Do not use the included fixture as a held-out accuracy claim.

## 13. Release recommendation

**ACCEPT WITH DOCUMENTED LIMITATION**

The local CUDA/CPU product, paired local-Ollama suggestions and static frontend are release-ready for their documented scope. Browser numerical ML remains intentionally unavailable. The missing current ONNX reproduction and browser E2E execution must remain documented rather than represented as passed.
