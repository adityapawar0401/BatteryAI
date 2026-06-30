# Testing

`scripts\test-all.ps1` verifies the artifact checksum; strict model construction/loading; CPU and available CUDA inference; deterministic finite output; inverse scaling; expert activation; input rejection; API authentication and inference; mocked loopback Ollama contracts and suggestion security; frontend parsing, order validation, pairing headers and local-suggestion states; TypeScript; and the production build. Ordinary tests never require Ollama or download a model.

`scripts\export-browser-model.ps1` separately records the genuine ONNX attempt. The deployment fixture is a training-cell software fixture and must not be reported as a new performance estimate.

`scripts\check-ollama.ps1` performs the separate live native-Ollama check, installed-model check, structured-output smoke test and best-effort processor-placement report. `scripts\smoke-ollama.ps1` runs only the live structured-output smoke test. Neither script installs Ollama or silently pulls a model.
