# Limitations

- The target is the next observed checkpoint, so elapsed time and degradation distance vary.
- RUL is untrained and unavailable.
- Only core operational, diagnostic curve, usage aging and residual experts were trained on Oxford; all others remain masked.
- The final checkpoint trained on all eight cells and has no held-out Oxford test set. Nested outer-fold evidence is the relevant performance source.
- Browser ONNX inference is unavailable for Oxford V1; a paired local engine is required for numerical predictions.
- A GTX 1650 has limited 4 GB VRAM. The runtime uses conservative request limits and retries CUDA out-of-memory once on CPU.
- Browser WebLLM needs WebGPU and a first-run model download; it is decision support, not safety certification.
