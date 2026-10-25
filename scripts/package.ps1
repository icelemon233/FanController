param([string]$OutputFile)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$metadata=Get-Content -LiteralPath (Join-Path $projectRoot 'version.json') -Raw | ConvertFrom-Json
$output=Join-Path $projectRoot 'artifacts\app'
if(-not (Test-Path -LiteralPath (Join-Path $output 'FanController.exe'))){throw 'Build the app before packaging.'}
if((Get-Item -LiteralPath (Join-Path $output 'FanController.exe')).VersionInfo.FileVersion -ne ($metadata.version+'.0')){throw 'The compiled app version differs from version.json.'}
if((Get-Item -LiteralPath (Join-Path $output 'FanController.Worker.exe')).VersionInfo.FileVersion -ne ($metadata.version+'.0')){throw 'The compiled worker version differs from version.json.'}
$frontendMetadata=Get-Content -LiteralPath (Join-Path $projectRoot 'frontend\dist\build-info.json') -Raw | ConvertFrom-Json
if($frontendMetadata.target -ne 'native' -or $frontendMetadata.version -ne $metadata.version){throw 'Packaging requires a native frontend build at the current app version.'}
$fanIconHash=(Get-FileHash -LiteralPath (Join-Path $projectRoot 'docs\brand\cinna-app-icon.png') -Algorithm SHA256).Hash.ToLowerInvariant()
if($frontendMetadata.iconSha256 -ne $fanIconHash){throw 'The frontend icon differs from the Cinna source. Rebuild the app before packaging.'}
$stage=Join-Path $projectRoot ('work\package-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
foreach($file in @('FanController.exe','FanController.Worker.exe','FanController.exe.config','FanController.Worker.exe.config')){Copy-Item -LiteralPath (Join-Path $output $file) -Destination $stage}
Get-ChildItem -LiteralPath $output -Filter '*.dll' -File | Copy-Item -Destination $stage
Copy-Item -LiteralPath (Join-Path $projectRoot 'frontend\dist') -Destination (Join-Path $stage 'ui') -Recurse
foreach($directory in @('docs','third-party')){Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination $stage -Recurse}
foreach($document in @('README.md','README.zh-CN.md')){Copy-Item -LiteralPath (Join-Path $projectRoot $document) -Destination $stage}
$dist=Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$archive=if($OutputFile){[IO.Path]::GetFullPath($OutputFile)}else{Join-Path $dist ('FanController-v'+$metadata.version+'-windows-x64.zip')}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $archive) | Out-Null
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -CompressionLevel Optimal -Force
$hash=Get-FileHash -LiteralPath $archive -Algorithm SHA256
($hash.Hash.ToLowerInvariant()+'  '+[IO.Path]::GetFileName($archive)) | Set-Content -LiteralPath ($archive+'.sha256') -Encoding ascii
Write-Output $archive
