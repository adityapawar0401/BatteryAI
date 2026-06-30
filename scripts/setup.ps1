$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root 'batteryai-gpu-env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $Python)) { throw "Required environment is missing: $Python" }
$Before = & $Python -c "import torch; print(torch.__version__)"
& $Python -m pip install -r (Join-Path $Root 'requirements-deployment.txt')
& $Python -m pip check
$After = & $Python -c "import torch; print(torch.__version__)"
if ($Before -ne $After) { throw "Setup changed PyTorch from $Before to $After; CUDA PyTorch must be preserved." }
& $Python -c "import torch; print('torch=', torch.__version__); print('cuda_available=', torch.cuda.is_available()); print('device=', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU fallback')"
& node --version
& npm.cmd --version
& npm.cmd install --prefix (Join-Path $Root 'apps\web')
Write-Host "BatteryAI setup complete. PyTorch preserved at $After."
