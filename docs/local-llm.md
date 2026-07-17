# Local Ollama suggestions

BatteryAI suggestions use the native Windows Ollama application at `http://127.0.0.1:11434` with exactly `llama3.2:3b`. Ollama must be installed separately; BatteryAI does not install it, change its bind address or require administrator access. Install the model explicitly with:

```powershell
ollama pull llama3.2:3b
```

The frontend never contacts Ollama directly. After the BatteryAI service is paired, it calls the protected `/v1/llm-capabilities` and `/v1/suggestions` endpoints using the existing pairing token. BatteryAI sends Ollama only a bounded structured summary of the latest completed prediction. Raw CSV rows, complete curves, point records, tokens, paths and arbitrary user prompts are not accepted.

The fixed system prompt treats summary values as data, prohibits numerical overrides, invented RUL/modalities/history, safety certification and guaranteed maintenance claims, and requests strict JSON only. Ollama receives the exact JSON Schema in `/api/chat`; BatteryAI validates the returned content again with Pydantic. A successful response requires a trimmed non-empty summary, one to four non-empty actions, and one to four non-empty cautions. Generated HTML, blank strings, empty arrays, extra keys, unbounded strings and numerical override fields are rejected. Suggestions cannot modify the authoritative numerical result.

If Ollama returns syntactically valid JSON that fails this content contract, BatteryAI performs at most one retry using the same bounded prediction summary plus a fixed corrective instruction. It never includes raw rows, the pairing token, paths, or arbitrary prompts. Malformed JSON, network errors, timeouts, cancellation, authentication, rate limits and other service failures are not retried. A second incomplete response returns structured HTTP 502 `incomplete_suggestions`; it is never presented as a successful result.

The earlier incomplete-actions defect occurred because the Pydantic fields specified only `max_length=5` for the arrays. That generated JSON Schema with `maxItems` but no `minItems`, so `[]` was valid to both Ollama and Python. String `min_length=1` also counted whitespace before trimming. The runtime model and generated schema now share the same explicit minimum, maximum and whitespace normalization rules.

No cloud LLM API or API key is used. Ollama decides GPU, CPU or mixed placement. A GTX 1650 has 4 GB VRAM, so the default context and output limits are conservative; BatteryAI does not change PyTorch CUDA placement to make room for Ollama.

## Troubleshooting

- **Ollama command missing:** install the native Windows Ollama application separately, then reopen the terminal.
- **API unavailable:** start Ollama and rerun `scripts\check-ollama.ps1`.
- **Model missing:** run `ollama pull llama3.2:3b` or explicitly run `scripts\setup-ollama-model.ps1`.
- **Timeout:** allow the first model load to complete, then retry; adjust `BATTERYAI_OLLAMA_TIMEOUT_SECONDS` within validated limits only when needed.
- **Out of memory:** close other GPU-heavy applications or allow Ollama to choose its own CPU/mixed offload. BatteryAI never silently moves numerical inference to CPU for suggestions.
- **Slow first generation:** model loading dominates the first request; `keep_alive` retains the model according to `configs/ollama.json`.

Use `scripts\check-ollama.ps1` for a real local health/model/structured-output check. Suggestions remain AI-generated decision support, not safety certification.
