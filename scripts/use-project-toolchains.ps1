$devtoolsRoot = 'E:\reader\.devtools'

$requiredDirectories = @(
  (Join-Path $devtoolsRoot 'rust\cargo'),
  (Join-Path $devtoolsRoot 'rust\rustup'),
  (Join-Path $devtoolsRoot 'gradle'),
  (Join-Path $devtoolsRoot 'android-sdk'),
  (Join-Path $devtoolsRoot 'jdk-21'),
  (Join-Path $devtoolsRoot 'vs-buildtools')
)

foreach ($directory in $requiredDirectories) {
  if (-not (Test-Path -LiteralPath $directory)) {
    throw "Project toolchain directory is missing: $directory"
  }
}

$env:CARGO_HOME = Join-Path $devtoolsRoot 'rust\cargo'
$env:RUSTUP_HOME = Join-Path $devtoolsRoot 'rust\rustup'
$env:GRADLE_USER_HOME = Join-Path $devtoolsRoot 'gradle'
$env:ANDROID_HOME = Join-Path $devtoolsRoot 'android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:NDK_HOME = Join-Path $env:ANDROID_HOME 'ndk\29.0.14206865'
$env:ANDROID_NDK_HOME = $env:NDK_HOME
$env:JAVA_HOME = Join-Path $devtoolsRoot 'jdk-21'
$env:NPM_CONFIG_CACHE = Join-Path $devtoolsRoot 'npm-cache'
$env:ELECTRON_CACHE = Join-Path $devtoolsRoot 'electron-cache'
$env:ELECTRON_BUILDER_CACHE = Join-Path $devtoolsRoot 'electron-builder-cache'

$toolPaths = @(
  (Join-Path $env:CARGO_HOME 'bin'),
  (Join-Path $env:JAVA_HOME 'bin'),
  (Join-Path $env:ANDROID_HOME 'platform-tools'),
  (Join-Path $env:ANDROID_HOME 'cmdline-tools\latest\bin')
)
$env:Path = (($toolPaths + @($env:Path)) -join ';')
