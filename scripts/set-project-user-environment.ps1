param(
  [Parameter(Mandatory = $true)]
  [string] $TargetSid
)

$ErrorActionPreference = 'Stop'
$environmentKey = "Registry::HKEY_USERS\$TargetSid\Environment"
if (-not (Test-Path -LiteralPath $environmentKey)) {
  throw "User environment registry key is unavailable: $environmentKey"
}

$values = @{
  CARGO_HOME = 'E:\reader\.devtools\rust\cargo'
  RUSTUP_HOME = 'E:\reader\.devtools\rust\rustup'
  GRADLE_USER_HOME = 'E:\reader\.devtools\gradle'
  ANDROID_HOME = 'E:\reader\.devtools\android-sdk'
  ANDROID_SDK_ROOT = 'E:\reader\.devtools\android-sdk'
  NDK_HOME = 'E:\reader\.devtools\android-sdk\ndk\29.0.14206865'
  ANDROID_NDK_HOME = 'E:\reader\.devtools\android-sdk\ndk\29.0.14206865'
  JAVA_HOME = 'E:\reader\.devtools\jdk-21'
  NPM_CONFIG_CACHE = 'E:\reader\.devtools\npm-cache'
  ELECTRON_CACHE = 'E:\reader\.devtools\electron-cache'
  ELECTRON_BUILDER_CACHE = 'E:\reader\.devtools\electron-builder-cache'
}

foreach ($entry in $values.GetEnumerator()) {
  Set-ItemProperty -LiteralPath $environmentKey -Name $entry.Key -Value $entry.Value -Type String
}

$toolPaths = @(
  'E:\reader\.devtools\rust\cargo\bin',
  'E:\reader\.devtools\jdk-21\bin',
  'E:\reader\.devtools\android-sdk\platform-tools',
  'E:\reader\.devtools\android-sdk\cmdline-tools\latest\bin'
)
$currentPath = (Get-ItemProperty -LiteralPath $environmentKey -Name Path -ErrorAction SilentlyContinue).Path
$remainingPaths = @(
  $currentPath -split ';' | Where-Object {
    $_ -and
    $_ -notmatch '\\.cargo\\bin$' -and
    $_ -notmatch 'Android\\Sdk' -and
    $_ -notmatch 'jdk-21'
  }
)
$newPath = (($toolPaths + $remainingPaths) | Select-Object -Unique) -join ';'
Set-ItemProperty -LiteralPath $environmentKey -Name Path -Value $newPath -Type ExpandString

Write-Output 'PROJECT_USER_ENVIRONMENT_UPDATED'
