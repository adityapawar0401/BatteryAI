# GitHub Pages

The workflow installs from `apps/web/package-lock.json`, tests, builds, verifies the static artifact and deploys `apps/web/dist`. Vite uses relative asset URLs, so an unknown repository subpath works without source edits. The artifact includes no checkpoint, raw dataset, Python runtime, pairing token or local filesystem path.

Without browser ONNX, the hosted app remains useful for schema validation, local-engine pairing, numerical result display and paired local-Ollama suggestions. The static artifact contains no LLM runtime; the browser calls only the paired BatteryAI loopback service.
