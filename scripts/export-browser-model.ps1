$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root 'batteryai-gpu-env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $Python)) { throw "Required environment is missing: $Python" }
$env:PYTHONPATH = Join-Path $Root 'services\local_inference'
$env:PYTHONUTF8 = '1'
& $Python -c "import onnx, onnxruntime, onnxscript" 2>$null
if ($LASTEXITCODE -ne 0) { throw "Browser export packages are missing. Install them with: $Python -m pip install -r $(Join-Path $Root 'requirements-export.txt')" }
& $Python (Join-Path $Root 'scripts\export_browser_model.py')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
