$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'use-project-toolchains.ps1')

$TauriArguments = @($args)

if ($TauriArguments.Count -gt 0 -and $TauriArguments[0] -eq '--') {
  $TauriArguments = @($TauriArguments | Select-Object -Skip 1)
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$tauriCli = Join-Path $repositoryRoot 'node_modules\@tauri-apps\cli\tauri.js'
if (-not (Test-Path -LiteralPath $tauriCli)) {
  throw 'Tauri CLI is missing. Run pnpm install first.'
}

& node.exe $tauriCli @TauriArguments
exit $LASTEXITCODE
