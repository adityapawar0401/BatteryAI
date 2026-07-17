# Design references

`landingpage.txt` and `dashboard.txt` are the original visual direction for the BatteryAI landing page and dashboard. They are **references only**:

- They are never imported, bundled, loaded at runtime, or copied into `dist`. `scripts/build-pages.ps1` and the Pages workflow fail the build if either file reaches the artifact.
- Their CDN Tailwind script, inline template JavaScript, and root-relative `/dashboard/` links are deliberately **not** reproduced. The shipped pages use React components, scoped CSS in `apps/web/src/styles/`, and base-aware links from `apps/web/src/routes.ts`.
- Their content is fabricated. The 99.8% accuracy claim, `Transformer-V4.2` model name, adaptive-charging and thermal-optimization features, live data stream, system-health percentage, KPI values, 48-cell pack visualization, deployment-request form, and social links describe a product that does not exist and are excluded from the build. Frontend tests assert their absence.

What was taken from them: the obsidian/titanium/volt/copper palette, the Inter-like body and JetBrains-Mono-like technical labels, the large technical hero, the reveal transitions, the particle backdrop, and the sidebar-plus-status-bar dashboard layout.
