$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$metadata=Get-Content -LiteralPath (Join-Path $projectRoot 'version.json') -Raw | ConvertFrom-Json
$output=Join-Path $projectRoot 'artifacts\app'
if(-not (Test-Path -LiteralPath (Join-Path $output 'cinna-fanCon.exe'))){throw 'Build the app before packaging.'}
$stage=Join-Path $projectRoot ('work\package-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
foreach($file in @('cinna-fanCon.exe','cinna-fanCon.Worker.exe','cinna-fanCon.exe.config','cinna-fanCon.Worker.exe.config')){Copy-Item -LiteralPath (Join-Path $output $file) -Destination $stage}
Get-ChildItem -LiteralPath $output -Filter '*.dll' -File | Copy-Item -Destination $stage
Copy-Item -LiteralPath (Join-Path $projectRoot 'frontend\dist') -Destination (Join-Path $stage 'ui') -Recurse
foreach($directory in @('docs','third-party')){Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination $stage -Recurse}
foreach($document in @('README.md','README.zh-CN.md')){Copy-Item -LiteralPath (Join-Path $projectRoot $document) -Destination $stage}
$dist=Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$archive=Join-Path $dist ('cinna-fanCon-v'+$metadata.version+'-windows-x64.zip')
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -CompressionLevel Optimal -Force
$hash=Get-FileHash -LiteralPath $archive -Algorithm SHA256
($hash.Hash.ToLowerInvariant()+'  '+[IO.Path]::GetFileName($archive)) | Set-Content -LiteralPath ($archive+'.sha256') -Encoding ascii
Write-Output $archive
