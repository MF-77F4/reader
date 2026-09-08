$ErrorActionPreference = 'Stop'

$source = 'C:\Program Files (x86)\Windows Kits\10'
$destination = 'E:\reader\.devtools\windows-kits\10'
$destinationPath = (Resolve-Path -LiteralPath $destination).Path

if ($destinationPath -ne $destination) {
  throw "Unexpected Windows Kits destination: $destinationPath"
}

$sourceItem = Get-Item -LiteralPath $source -Force -ErrorAction SilentlyContinue
if ($sourceItem -and ($sourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  Write-Output 'WINDOWS_KITS_ALREADY_RELOCATED'
  exit 0
}

if (-not $sourceItem) {
  throw "Windows Kits source directory is missing: $source"
}

$sourcePath = (Resolve-Path -LiteralPath $source).Path
if ($sourcePath -ne $source) {
  throw "Unexpected Windows Kits source: $sourcePath"
}

Remove-Item -LiteralPath $sourcePath -Recurse -Force
New-Item -ItemType Junction -Path $source -Target $destinationPath | Out-Null

$junction = Get-Item -LiteralPath $source -Force
if (-not ($junction.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  throw 'Windows Kits compatibility junction was not created'
}

Write-Output 'WINDOWS_KITS_RELOCATED'
