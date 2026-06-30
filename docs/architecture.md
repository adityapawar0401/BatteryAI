# Architecture

The browser owns input editing, canonical CSV parsing, capability selection and result presentation. `InferenceProvider` is the common cancellation-aware numerical boundary implemented by browser ONNX and paired local HTTP providers. Auto selects verified browser inference first, then a user-paired local engine; it never sends rows locally before pairing.

Optional suggestions use a separate paired-local boundary: the browser sends only a bounded completed-prediction summary to `/v1/suggestions`; the existing BatteryAI FastAPI service validates it and calls native Ollama at loopback with exactly `llama3.2:3b`. Ollama never receives raw CSV rows, curves, pairing tokens, filesystem paths or arbitrary user prompts, and the browser never calls Ollama directly.

The FastAPI service validates the same row contract, reconstructs the universal model from checkpoint configuration, strictly loads all tensors, applies Oxford preprocessing, masks the six unsupported experts, and inversely scales SOH location and standard deviation. Future providers implement the TypeScript interface; future datasets add a model profile, schema and preprocessing adapter without embedding dataset constants in UI components.
