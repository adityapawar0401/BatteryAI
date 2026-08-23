# GitHub Pages

The workflow installs from `apps/web/package-lock.json`, tests, verifies the `BATTERYAI_REMOTE_API_URL` and `RELI_CONTACT_FORM_ENDPOINT` repository variables, builds, verifies the static artifact and deploys `apps/web/dist`. The artifact includes no checkpoint, raw dataset, Python runtime, pairing token, credential or local filesystem path.

## Contact form configuration

Create the Actions repository variable `RELI_CONTACT_FORM_ENDPOINT` with the public Formspree endpoint `https://formspree.io/f/xvkpnweg`. The workflow maps it to `VITE_RELI_CONTACT_FORM_ENDPOINT` only for the Vite build and verifies that the value is present in the production artifact. The notification recipient remains controlled in Formspree rather than submitted by the browser.

For local development, set `VITE_RELI_CONTACT_FORM_ENDPOINT` before starting or building the frontend. If it is absent, the Contact page starts normally and offers the direct `support.reli@gmail.com` email fallback without making a request.

## Three static pages

The frontend is a Vite multi-page build with three real HTML entries, so all public routes are plain static files:

| Route | Artifact file | Entry |
| --- | --- | --- |
| `https://adityapawar0401.github.io/BatteryAI/` | `dist/index.html` | `apps/web/src/main.tsx` → `LandingPage` |
| `https://adityapawar0401.github.io/BatteryAI/dashboard/` | `dist/dashboard/index.html` | `apps/web/src/dashboard-main.tsx` → `DashboardPage` |
| `https://adityapawar0401.github.io/BatteryAI/contact/` | `dist/contact/index.html` | `apps/web/src/contact-main.tsx` → `ContactPage` |

Because the nested routes resolve to real `index.html` files, direct navigation and browser refresh work without a Pages 404 and without an SPA fallback or a `404.html` redirect trick.

Local development serves the same entries from the Vite dev server at `http://localhost:5173/`, `http://localhost:5173/dashboard/` and `http://localhost:5173/contact/`.

## Base path

The build uses an absolute base, defaulting to `/BatteryAI/`, and the dev server uses `/`. Set `BATTERYAI_PAGES_BASE` to build for a different repository subpath (it must start and end with `/`); the workflow passes it through if the `BATTERYAI_PAGES_BASE` repository variable is defined.

Nothing in the source hard-codes `/`, `/dashboard/`, `/contact/` or a domain-root asset path. Every internal link and runtime asset URL is derived from the Vite base through `apps/web/src/routes.ts` (`landingPath`, `dashboardPath`, `contactPath`, `assetPath`), which is covered by `apps/web/src/routes.test.ts`.

## Artifact verification

`scripts/build-pages.ps1` and the workflow both fail the build when `dist` is missing `index.html`, `dashboard/index.html` or `contact/index.html`, or when it contains a checkpoint, `.onnx` model, `.mat` dataset, `_inputs`, `batteryai-gpu-env`, local reports, a local absolute path, pairing-token text, the `landingpage.txt`/`dashboard.txt` design references, a CDN Tailwind script, or an unsupported marketing claim.

They also fail when an internal implementation term appears in rendered markup, including the `<meta name="description">` tags. Bundled JavaScript may still contain API contract strings the application needs; the requirement is that they never reach the rendered client experience. See [client-experience.md](client-experience.md).

Without browser ONNX, the hosted app remains useful for schema validation, engine pairing, numerical result display and paired local-Ollama suggestions. The static artifact contains no LLM runtime; the browser calls only the paired BatteryAI service.
