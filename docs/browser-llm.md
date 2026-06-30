# Browser LLM suggestions

The installed WebLLM catalog was inspected and contains `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`, the configured small general instruction model. It is lazily initialized in a Web Worker only after a result exists and the user asks for suggestions. WebGPU is required.

The model receives a bounded structured summary—not raw curve rows—and returns JSON validated into summary, actions and cautions. Generated HTML is never rendered. Numerical outputs are immutable and visually separate. Failure or insufficient browser resources leaves numerical ML and deterministic facts available without contacting a cloud generation service.
