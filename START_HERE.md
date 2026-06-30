# Start here on Windows

Open the VS Code Command Palette and run **Tasks: Run Task**.

1. Run **BatteryAI: Setup** once. It installs deployment packages into the supplied environment, verifies the CUDA PyTorch version is unchanged, and installs web packages.
2. Run **BatteryAI: Test All**. This verifies the artifact, Python runtime/API, frontend, and GitHub Pages build.
3. Run **BatteryAI: Start Local Inference**. Copy the printed pairing token. `auto` prefers the NVIDIA GPU and falls back to CPU if CUDA is unavailable or one inference runs out of GPU memory.
4. In a second terminal, run **BatteryAI: Start Web** and open `http://127.0.0.1:5173`.
5. In BatteryAI, enter the local endpoint and token, choose **Test & pair local engine**, load the real example, validate, and run.

The first WebLLM suggestion request downloads and browser-caches `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`. It requires WebGPU and can take several minutes. No cloud text-generation fallback is used.
