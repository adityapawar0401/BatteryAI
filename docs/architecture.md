# Architecture

> Current production topology: `DashboardPage` is the one canonical assessment page. It owns pairing, the Operational / EV snapshot workflow, the separate Diagnostic Curve / SOH workflow, the sequential calls to their existing endpoints, and the combined result state. `failure-main.tsx` is only a backward-compatible redirect to `/dashboard/#failure-risk`. The input contracts, preprocessing, expert masks, and response heads remain separate while both endpoints use the backend's one cached `BatteryAIEngine` and `self.model`.

The static frontend is a Vite multi-page build. `main.tsx` renders `LandingPage`, a backend-free description of the system. `dashboard-main.tsx` renders the one canonical `DashboardPage`, which owns configuration, pairing, both input workflows, inference, combined assessment, and suggestion status. `failure-main.tsx` is only a backward-compatible redirect. Shared route helpers derive every internal link and asset URL from the Vite base so the same source serves `/` locally and `/BatteryAI/` on GitHub Pages.

The browser owns input editing, canonical CSV parsing, capability selection and result presentation. `InferenceProvider` is the common cancellation-aware numerical boundary implemented by browser ONNX and paired local HTTP providers. Auto selects verified browser inference first, then a user-paired local engine; it never sends rows locally before pairing.

Optional suggestions use a separate paired-local boundary: the browser sends only a bounded completed-prediction summary to `/v1/suggestions`; the existing BatteryAI FastAPI service validates it and calls native Ollama at loopback with exactly `llama3.2:3b`. Ollama never receives raw CSV rows, curves, pairing tokens, filesystem paths or arbitrary user prompts, and the browser never calls Ollama directly.

The FastAPI service verifies and strictly loads the combined descendant once. `/v1/infer` applies the Oxford scaler and Oxford expert policy before inversely scaling SOH location and standard deviation. `/api/predict/failure` and its batch variant apply the checkpoint's EV unit conversion, fitted scaling, chemistry vocabulary and missing masks with the EV expert policy, then use the stored failure threshold. The RUL head is never exposed.

The frontend has entries for the backend-free landing page, the unified BatteryAI dashboard, the contact page, and the legacy failure redirect. Repository-subpath routing, authentication, and remote endpoint controls remain unchanged.
