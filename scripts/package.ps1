$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$metadata=Get-Content -LiteralPath (Join-Path $projectRoot 'version.json') -Raw | ConvertFrom-Json
$output=Join-Path $projectRoot 'artifacts\app'
if(-not (Test-Path -LiteralPath (Join-Path $output 'cinna-fanCon.exe'))){throw 'Build the app before packaging.'}
foreach($document in @('README.md','README.zh-CN.md')){Copy-Item -LiteralPath (Join-Path $projectRoot $document) -Destination $output -Force}
$dist=Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$archive=Join-Path $dist ('cinna-fanCon-v'+$metadata.version+'-windows-x64.zip')
Compress-Archive -Path (Join-Path $output '*') -DestinationPath $archive -CompressionLevel Optimal -Force
$hash=Get-FileHash -LiteralPath $archive -Algorithm SHA256
($hash.Hash.ToLowerInvariant()+'  '+[IO.Path]::GetFileName($archive)) | Set-Content -LiteralPath ($archive+'.sha256') -Encoding ascii
Write-Output $archive
