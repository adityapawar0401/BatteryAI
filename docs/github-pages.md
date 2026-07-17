# GitHub Pages

The workflow installs from `apps/web/package-lock.json`, tests, verifies the `BATTERYAI_REMOTE_API_URL` repository variable, builds, verifies the static artifact and deploys `apps/web/dist`. The artifact includes no checkpoint, raw dataset, Python runtime, pairing token or local filesystem path.

## Two static pages

The frontend is a Vite multi-page build with two real HTML entries, so both public routes are plain static files:

| Route | Artifact file | Entry |
| --- | --- | --- |
| `https://adityapawar0401.github.io/BatteryAI/` | `dist/index.html` | `apps/web/src/main.tsx` → `LandingPage` |
| `https://adityapawar0401.github.io/BatteryAI/dashboard/` | `dist/dashboard/index.html` | `apps/web/src/dashboard-main.tsx` → `DashboardPage` |

Because `/BatteryAI/dashboard/` resolves to a real `dashboard/index.html`, direct navigation and browser refresh work without a Pages 404 and without an SPA fallback or a `404.html` redirect trick.

Local development serves the same entries from the Vite dev server at `http://localhost:5173/` and `http://localhost:5173/dashboard/`.

## Base path

The build uses an absolute base, defaulting to `/BatteryAI/`, and the dev server uses `/`. Set `BATTERYAI_PAGES_BASE` to build for a different repository subpath (it must start and end with `/`); the workflow passes it through if the `BATTERYAI_PAGES_BASE` repository variable is defined.

Nothing in the source hard-codes `/`, `/dashboard/` or a domain-root asset path. Every internal link and runtime asset URL is derived from the Vite base through `apps/web/src/routes.ts` (`landingPath`, `dashboardPath`, `assetPath`), which is covered by `apps/web/src/routes.test.ts`. That is what lets one source tree serve `/dashboard/` locally and `/BatteryAI/dashboard/` on Pages.

## Artifact verification

`scripts/build-pages.ps1` and the workflow both fail the build when `dist` is missing `index.html` or `dashboard/index.html`, or when it contains a checkpoint, `.onnx` model, `.mat` dataset, `_inputs`, `batteryai-gpu-env`, local reports, a local absolute path, pairing-token text, the `landingpage.txt`/`dashboard.txt` design references, a CDN Tailwind script, or an unsupported marketing claim.

Without browser ONNX, the hosted app remains useful for schema validation, engine pairing, numerical result display and paired local-Ollama suggestions. The static artifact contains no LLM runtime; the browser calls only the paired BatteryAI service.
