# Runs an ExtendScript file inside the RUNNING After Effects and prints its log.
# Usage: powershell -File run_ae.ps1 -Jsx <script.jsx> -JobDir <job folder> [-TimeoutSec 180]
# The script gets two globals: JOB_DIR and SKILL_DIR (forward-slash paths). It must write JOB_DIR/ae_log.txt.
param([Parameter(Mandatory)][string]$Jsx, [Parameter(Mandatory)][string]$JobDir, [int]$TimeoutSec = 180)
$exe = Get-ChildItem "C:\Program Files\Adobe\Adobe After Effects *\Support Files\AfterFX.exe" | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $exe) { throw "AfterFX.exe not found" }
if (-not (Get-Process AfterFX -ErrorAction SilentlyContinue)) { throw "After Effects is not running - open it first" }
$skill = (Split-Path $PSScriptRoot -Parent) -replace '\\', '/'
$jd = (Resolve-Path $JobDir).Path -replace '\\', '/'
$js = (Resolve-Path $Jsx).Path -replace '\\', '/'
$log = Join-Path $JobDir 'ae_log.txt'
Remove-Item $log -ErrorAction SilentlyContinue
$code = "var JOB_DIR='$jd'; var SKILL_DIR='$skill'; `$.evalFile(new File('$js'));"
Start-Process $exe.FullName -ArgumentList '-s', "`"$code`"" -Wait
for ($i = 0; $i -lt $TimeoutSec; $i++) { if (Test-Path $log) { break }; Start-Sleep 1 }
if (Test-Path $log) { Start-Sleep 2; Get-Content $log -Encoding utf8 }
else { Write-Output "NO LOG after $TimeoutSec s - After Effects is probably blocked by an open dialog (ask the user to close it)" ; exit 1 }
