# Stable remote deployment

BatteryAI remote mode keeps computation self-hosted. GitHub Pages serves only the static React frontend. Battery-PIMoE, the finalized Oxford checkpoint, CUDA/CPU execution, and optional Ollama `llama3.2:3b` continue to run on the Windows host. The browser calls a stable public HTTPS `*.ts.net` URL exposed by Tailscale Funnel; Funnel proxies only to FastAPI on `127.0.0.1:8000`. Ollama remains on `127.0.0.1:11434` and is never contacted by the browser.

The host PC must remain powered on, connected to Tailscale, and online. This arrangement provides no cloud GPU and no uptime guarantee.

## One-time configuration

1. Install Tailscale manually, sign in, enable MagicDNS/HTTPS and Funnel for the tailnet as required by the installed client, and confirm `tailscale status` reports the machine online. BatteryAI never installs or elevates Tailscale.
2. Determine the machine DNS name from `tailscale status --json`. Its public API origin is exactly `https://MACHINE.TAILNET.ts.net`, with no path, query, fragment, credentials, or custom port.
3. In the shell used to start BatteryAI, set only public deployment values:

   ```powershell
   $env:BATTERYAI_REMOTE_API_URL = 'https://MACHINE.TAILNET.ts.net'
   $env:BATTERYAI_ALLOWED_FRONTEND_ORIGINS = 'https://USERNAME.github.io'
   ```

   The GitHub Pages value is an origin, not a repository path. Loopback Vite origins are retained explicitly for development. Wildcards are rejected.
4. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables** and create the repository variable `BATTERYAI_REMOTE_API_URL` with that same Funnel origin. This URL is public configuration, not a secret. Never put a pairing token in GitHub variables, secrets, commits, build files, or URLs.
5. Enable GitHub Pages through GitHub Actions. The existing workflow builds with remote mode enabled and fails if the variable is missing or is not an exact HTTPS `*.ts.net` origin. Repository-subpath hosting remains supported through relative assets.

## Start, verify, and stop

Run **BatteryAI: Start Remote** or:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-remote.ps1 -Device auto
```

The launcher validates the installed Tailscale client and its live `funnel --help`, validates the stable hostname and GitHub Pages origin, starts FastAPI on loopback, waits for local health, then enables HTTPS Funnel with the installed CLI's supported background syntax. It prints the stable URL, local endpoint, new startup pairing token, numerical device, checkpoint hash, and Ollama status. Ollama may be unavailable; numerical inference still starts.

Copy the token privately to the intended user. In the GitHub Pages UI, verify the locked backend URL, enter the token, and explicitly pair. The token is held only in browser `sessionStorage` and disappears when the tab session ends. Restarting the BatteryAI service creates a new cryptographically random token and invalidates the old one.

With the launcher running, use **BatteryAI: Check Remote Deployment** to verify loopback and public health, the Funnel hostname, HTTPS, pairing enforcement, exact-origin CORS, GitHub Pages origin, Ollama status, numerical device, and checkpoint hash.

Press Ctrl+C in the launcher to stop its FastAPI child and disable its Funnel configuration. **BatteryAI: Stop Remote** (or `scripts\stop-remote.ps1`) safely disables Funnel separately. It does not delete application or model data. BatteryAI never opens router ports, changes Windows Firewall, exposes Ollama, or binds FastAPI to `0.0.0.0`.

## Test from another network

1. Keep the host and remote launcher running.
2. On a phone with Wi-Fi disabled or a computer on another network, open the GitHub Pages site.
3. Confirm the displayed backend is the configured `https://…ts.net` origin and cannot be edited.
4. Enter the startup token and pair. An invalid token must return a structured authentication failure.
5. Load the supplied example, validate, run one numerical prediction, and optionally check suggestions. The browser talks only to FastAPI; FastAPI talks to local Ollama.
6. Stop remote exposure and confirm the public health URL is no longer available.

## Security and resource limits

Anyone who has both the public Funnel URL and the current pairing token can consume local CPU/GPU and Ollama resources. Share the token privately and rotate it by restarting the service if exposure is suspected. Authenticated responses are `no-store`; remote Swagger/OpenAPI is disabled; CORS uses exact origins; expensive endpoints are authenticated; numerical inference and suggestion generation each default to one active request; excess work receives structured HTTP 429; a per-client/token sliding-window rate limit and request timeouts are enforced. Existing upload, row, sequence, and strict input limits remain in force. Inputs, prompts, and generated results are not persisted by this layer.

This mode is intended for non-commercial personal use subject to the Tailscale plan and Funnel terms applicable to the account. Check those terms before broader use. It is not a hosted service, cloud GPU offering, or availability commitment.
