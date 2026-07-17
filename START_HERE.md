# Start here on Windows

Open the VS Code Command Palette and run **Tasks: Run Task**.

1. Run **BatteryAI: Setup** once. It installs deployment packages into the supplied environment, verifies the CUDA PyTorch version is unchanged, and installs web packages.
2. Run **BatteryAI: Test All**. This verifies the artifact, Python runtime/API, frontend, and GitHub Pages build.
3. Run **BatteryAI: Start Local Inference**. Copy the printed pairing token. `auto` prefers the NVIDIA GPU and falls back to CPU if CUDA is unavailable or one inference runs out of GPU memory.
4. In a second terminal, run **BatteryAI: Start Web** and open `http://localhost:5173/` for the landing page, or go straight to the dashboard at `http://localhost:5173/dashboard/`.
5. On the dashboard, enter the local endpoint and token, choose **Test & pair host engine**, load the supplied example, validate, and run. There is no sign-in: pairing with your own service is the only step, and the token stays in `sessionStorage` for that tab.

Optional local suggestions require the native Windows Ollama application. Install Ollama separately, then run **BatteryAI: Setup Local LLM** (equivalent to `ollama pull llama3.2:3b`) and **BatteryAI: Check Local LLM**. The frontend never calls Ollama directly: it sends only a bounded prediction summary through the paired BatteryAI service. No cloud fallback or API key is used.

Published, the same two pages are `https://adityapawar0401.github.io/BatteryAI/` and `https://adityapawar0401.github.io/BatteryAI/dashboard/`. GitHub Pages serves static files only; your computer runs the model.

For stable remote access, keep the host online and follow [docs/remote-deployment.md](docs/remote-deployment.md). Configure the exact Funnel URL and GitHub Pages origin, then use **BatteryAI: Start Remote**, **BatteryAI: Check Remote Deployment**, and **BatteryAI: Stop Remote**. Never publish the startup pairing token.
