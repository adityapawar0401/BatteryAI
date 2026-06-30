$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root 'batteryai-gpu-env\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $Python)) { throw "Required environment is missing: $Python" }
& $Python -c "import hashlib,pathlib; root=pathlib.Path(r'$Root'); p=root/'_inputs/artifacts/oxford_final/model.pt'; expected=(p.parent/'model.pt.sha256').read_text().split()[0]; actual=hashlib.sha256(p.read_bytes()).hexdigest(); assert actual==expected, f'checksum mismatch: {actual}'; print('BATTERYAI_PREFLIGHT=PASSED'); print('model_sha256='+actual)"
