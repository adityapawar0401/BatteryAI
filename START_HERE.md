# Start here on Windows

Open the VS Code Command Palette and run **Tasks: Run Task**.

1. Run **BatteryAI: Setup** once. It installs deployment packages into the supplied environment, verifies the CUDA PyTorch version is unchanged, and installs web packages.
2. Run **BatteryAI: Test All**. This verifies the artifact, Python runtime/API, frontend, and GitHub Pages build.
3. Run **BatteryAI: Start Local Inference**. Copy the printed pairing token. `auto` prefers the NVIDIA GPU and falls back to CPU if CUDA is unavailable or one inference runs out of GPU memory.
4. In a second terminal, run **BatteryAI: Start Web** and open `http://127.0.0.1:5173`.
5. In BatteryAI, enter the local endpoint and token, choose **Test & pair local engine**, load the real example, validate, and run.

Optional local suggestions require the native Windows Ollama application. Install Ollama separately, then run **BatteryAI: Setup Local LLM** (equivalent to `ollama pull llama3.2:3b`) and **BatteryAI: Check Local LLM**. The frontend never calls Ollama directly: it sends only a bounded prediction summary through the paired BatteryAI service. No cloud fallback or API key is used.
