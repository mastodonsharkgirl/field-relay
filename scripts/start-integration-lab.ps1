param([Parameter(ValueFromRemainingArguments = $true)][string[]]$LabArgs)
$ErrorActionPreference = 'Stop'
$ProjectDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
& node (Join-Path $ProjectDirectory 'integration/launch.ts') @LabArgs
exit $LASTEXITCODE
