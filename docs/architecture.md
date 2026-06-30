# Architecture

The browser owns input editing, canonical CSV parsing, capability selection, result presentation and optional WebLLM suggestions. `InferenceProvider` is the common cancellation-aware boundary implemented by browser ONNX and paired local HTTP providers. Auto selects verified browser inference first, then a user-paired local engine; it never sends rows locally before pairing.

The FastAPI service validates the same row contract, reconstructs the universal model from checkpoint configuration, strictly loads all tensors, applies Oxford preprocessing, masks the six unsupported experts, and inversely scales SOH location and standard deviation. Future providers implement the TypeScript interface; future datasets add a model profile, schema and preprocessing adapter without embedding dataset constants in UI components.
