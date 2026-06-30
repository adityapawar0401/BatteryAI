# BatteryAI workspace rules

Work only inside this repository. Treat `_inputs` as externally supplied and read-only. Use `batteryai-gpu-env\Scripts\python.exe`; do not create another Python environment or replace the installed CUDA PyTorch build.

Production inference must use the finalized checkpoint and exact Oxford scaler/adapter contract. The active experts are `core_operational`, `diagnostic_curve`, `usage_aging`, and `residual`. RUL is not operational. Do not silently substitute generated output when an inference backend is unavailable.

Never track `_inputs`, `batteryai-gpu-env`, `model.pt`, the Oxford `.mat` file, pairing tokens, or local reports. Bind the local engine to loopback and keep pairing tokens in browser `sessionStorage`.
