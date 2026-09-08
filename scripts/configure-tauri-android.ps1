$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$gradleProperties = Join-Path $repositoryRoot 'src-tauri\gen\android\gradle.properties'
$localProperties = Join-Path $repositoryRoot 'src-tauri\gen\android\local.properties'
$buildTask = Get-ChildItem -LiteralPath (Join-Path $repositoryRoot 'src-tauri\gen\android\buildSrc\src\main\java') -Recurse -Filter 'BuildTask.kt' | Select-Object -First 1
$requiredSettings = @(
  'kotlin.incremental=false',
  'kotlin.compiler.execution.strategy=in-process'
)

if (-not (Test-Path -LiteralPath $gradleProperties)) {
  throw 'Android project is missing. Run pnpm tauri android init --ci first.'
}

Set-Content -LiteralPath $localProperties -Value 'sdk.dir=E\:\\reader\\.devtools\\android-sdk'

$content = Get-Content -LiteralPath $gradleProperties -Raw
foreach ($setting in $requiredSettings) {
  if ($content -notmatch [regex]::Escape($setting)) {
    Add-Content -LiteralPath $gradleProperties -Value $setting
  }
}

if (-not $buildTask) {
  throw 'Generated Android BuildTask.kt is missing.'
}

$buildTaskContent = Get-Content -LiteralPath $buildTask.FullName -Raw
$incorrectCliArgs = 'val args = listOf("tauri", "android", "android-studio-script");'
$projectCliArgs = 'val args = listOf("../node_modules/@tauri-apps/cli/tauri.js", "android", "android-studio-script");'
if ($buildTaskContent.Contains($incorrectCliArgs)) {
  $buildTaskContent = $buildTaskContent.Replace($incorrectCliArgs, $projectCliArgs)
  Set-Content -LiteralPath $buildTask.FullName -Value $buildTaskContent -NoNewline
}

Write-Output 'Tauri Android Gradle compatibility settings are configured.'
