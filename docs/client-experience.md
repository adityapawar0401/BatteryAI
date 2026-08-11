# Client-facing experience

The public website and this repository serve different audiences. The site presents outcomes and workflow; the technical detail stays here.

## What the UI must never present

Oxford / Oxford V1, Battery-PIMoE, model architecture, active or masked experts, model profile, checkpoint or checkpoint hash, SHA-256, Ollama, `llama3.2:3b`, local LLM, ONNX or browser ML, FastAPI, Tailscale or Funnel, GitHub Pages, CUDA or CPU fallback, loopback, remote versus local deployment mode, the backend or Funnel URL, RUL availability, and the next-observed-checkpoint horizon.

None of this is removed from the system — only from the screen. The backend continues to use every internal value, and the frontend continues to receive the current API responses unchanged.

## Terminology mapping

| Internal | Customer-facing |
| --- | --- |
| Pairing token | Access code |
| Pair / paired / unpaired | Connect / Connected / Disconnected |
| Backend endpoint, Funnel URL | not shown; supplied by configuration |
| Prediction, inference | Analysis |
| Predictive standard deviation | Uncertainty |
| `actual_soh` | Reference SOH |
| Suggestions, Local Ollama | AI Insights |
| Cautions | Considerations |
| Oxford V1 CSV contract | BatteryAI CSV format |

## How confidentiality is enforced

1. **Prompt payload** — `ollama.py` sends only `predicted_soh_percent` and `predictive_uncertainty_pp` to the model. Reference values, observed error, input-quality notes and internal identifiers in `SuggestionSummary` never enter the prompt. The HTTP contract and bounded retry are unchanged.
2. **System prompt and validation** — constrain generation to State of Health interpretation, reject unsupported SOC and model/infrastructure commentary, and require one summary, 2 to 4 actions and 1 to 3 considerations.
3. **Frontend guard** — `src/clientText.ts` drops any generated entry that still carries an internal term, replaces a leaking summary with a product-level statement, and translates service errors for display. It never touches numbers, validation or the contracts.
4. **Build scan** — `scripts/build-pages.ps1` and the Pages workflow fail the build if an internal term appears in rendered markup. Bundled JavaScript may still contain API contract strings; the requirement is that they never reach the rendered experience.

## Terms that legitimately remain visible

The canonical CSV column names — `sequence_id`, `cell_id`, `source_checkpoint`, `target_checkpoint`, `modality`, `point_index`, `time_s`, `voltage_V`, `capacity_Ah`, `temperature_K`, `actual_soh` — stay in the format help and validation output. Users cannot prepare a valid file without them. Validation errors are shown verbatim for the same reason.

## When adding UI copy

Check it against the list above, and prefer the customer-facing column of the mapping table. Frontend tests in `src/landing/LandingPage.test.tsx` and `src/dashboard/DashboardPage.test.tsx` assert the absence of internal terms in rendered output; `src/clientText.test.ts` covers the guard itself.
