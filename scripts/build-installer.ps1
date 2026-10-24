param(
  [string]$CompilerPath,
  [string]$InstallerQaRoot,
  [ValidateSet('SimpChinese','English')][string]$InstallerQaLanguage='SimpChinese'
)
$ErrorActionPreference='Stop'
$fanRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fanMetadata=Get-Content -LiteralPath (Join-Path $fanRoot 'version.json') -Raw | ConvertFrom-Json
$fanQaArguments=@()
if($InstallerQaRoot){
  $InstallerQaRoot=[IO.Path]::GetFullPath($InstallerQaRoot)
  $fanQaParent=Join-Path $fanRoot 'work'
  $fanQaName=[IO.Path]::GetFileName($InstallerQaRoot)
  if([IO.Path]::GetDirectoryName($InstallerQaRoot) -ne $fanQaParent -or $fanQaName -notmatch '^installer-ui-qa-([a-f0-9]{32})$'){
    throw 'Installer UI QA must use a new work/installer-ui-qa-<GUID> directory inside this project.'
  }
  $fanQaId=$Matches[1]
  $fanQaLanguage=if($InstallerQaLanguage -eq 'English'){1033}else{2052}
  $fanQaArguments=@(('/DInstallerQaRoot='+$InstallerQaRoot),('/DInstallerQaId='+$fanQaId),('/DInstallerQaLanguage='+$fanQaLanguage))
  New-Item -ItemType Directory -Force -Path $InstallerQaRoot | Out-Null
}
$fanDependencies=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'dependencies.json') -Raw | ConvertFrom-Json
$fanCache=Join-Path $fanRoot '.deps'
New-Item -ItemType Directory -Force -Path $fanCache | Out-Null
if(-not $CompilerPath){
  $fanDependency=$fanDependencies.InstallerNSIS
  $fanCompilerZip=Join-Path $fanCache ('InstallerNSIS-'+$fanDependency.version+'.zip')
  if(-not (Test-Path -LiteralPath $fanCompilerZip)){
    $fanCompilerDownload=$fanCompilerZip+'.download'
    $fanCompilerResponse=Invoke-WebRequest -Uri $fanDependency.url -OutFile $fanCompilerDownload -PassThru -SessionVariable fanNsisSession
    if($fanCompilerResponse.Headers['Content-Type'] -match 'text/html'){
      # SourceForge may return a download page with a short-lived HTTPS link.
      $fanDownloadPage=[IO.File]::ReadAllText($fanCompilerDownload)
      $fanDownloadMatch=[regex]::Match($fanDownloadPage,'<meta http-equiv="refresh" content="[0-9]+; url=([^"]+)"')
      if(-not $fanDownloadMatch.Success){throw 'The NSIS download page did not provide a supported HTTPS link.'}
      $fanDownloadUri=[Uri]::new([Net.WebUtility]::HtmlDecode($fanDownloadMatch.Groups[1].Value))
      $fanExpectedUri=[Uri]::new($fanDependency.url)
      if($fanDownloadUri.Scheme -ne 'https' -or $fanDownloadUri.Host -ne $fanExpectedUri.Host -or $fanDownloadUri.AbsolutePath -ne $fanExpectedUri.AbsolutePath){throw 'Unexpected NSIS download redirect.'}
      Invoke-WebRequest -Uri $fanDownloadUri -WebSession $fanNsisSession -OutFile $fanCompilerDownload
    }
    if((Get-FileHash -LiteralPath $fanCompilerDownload -Algorithm SHA256).Hash -ne $fanDependency.sha256){throw 'NSIS archive checksum mismatch.'}
    Move-Item -LiteralPath $fanCompilerDownload -Destination $fanCompilerZip
  }
  if((Get-FileHash -LiteralPath $fanCompilerZip -Algorithm SHA256).Hash -ne $fanDependency.sha256){throw 'NSIS archive checksum mismatch.'}
  Expand-Archive -LiteralPath $fanCompilerZip -DestinationPath $fanCache -Force
  $CompilerPath=Join-Path $fanCache ('nsis-'+$fanDependency.version+'\makensis.exe')
}
if(-not (Test-Path -LiteralPath $CompilerPath)){throw 'NSIS makensis.exe was not found.'}
$fanBootstrapper=Join-Path $fanCache 'MicrosoftEdgeWebview2Setup.exe'
if(-not (Test-Path -LiteralPath $fanBootstrapper)){Invoke-WebRequest -Uri $fanDependencies.WebView2Bootstrapper.url -OutFile $fanBootstrapper}
$fanBootstrapperHash=(Get-FileHash -LiteralPath $fanBootstrapper -Algorithm SHA256).Hash
if($fanBootstrapperHash -ne $fanDependencies.WebView2Bootstrapper.sha256){throw ('WebView2 bootstrapper checksum mismatch ('+$fanBootstrapperHash+'); verify the current Microsoft download before updating dependencies.json.')}
$fanSignature=Get-AuthenticodeSignature -LiteralPath $fanBootstrapper
if($fanSignature.Status -ne 'Valid' -or $fanSignature.SignerCertificate.Subject -notmatch 'Microsoft Corporation'){throw 'WebView2 bootstrapper signature verification failed.'}
$fanApp=Join-Path $fanRoot 'artifacts\app\FanController.exe'
if((Get-Item -LiteralPath $fanApp).VersionInfo.FileVersion -ne ($fanMetadata.version+'.0')){throw 'Build the app at the current version before creating the installer.'}
& (Join-Path $PSScriptRoot 'create-icon.ps1') | Write-Host
& (Join-Path $PSScriptRoot 'test-installer-branding.ps1') | Write-Host
$fanArchive=& (Join-Path $PSScriptRoot 'package.ps1')
$fanStage=Join-Path $fanRoot ('work\installer-'+[Guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $fanArchive -DestinationPath $fanStage
$fanRemoval=[Collections.Generic.List[string]]::new()
$fanSize=0
function ConvertTo-NsisString([string]$Value){return $Value.Replace('$','$$').Replace('"','$\"')}
foreach($fanFile in (Get-ChildItem -LiteralPath $fanStage -File -Recurse)){
  $fanRelative=[IO.Path]::GetRelativePath($fanStage,$fanFile.FullName)
  if($fanRelative.StartsWith('..') -or [IO.Path]::IsPathRooted($fanRelative)){throw 'Unexpected installer payload path.'}
  $fanRemoval.Add('Delete "$INSTDIR\'+(ConvertTo-NsisString $fanRelative)+'"')
  $fanSize+=$fanFile.Length
}
foreach($fanDirectory in (Get-ChildItem -LiteralPath $fanStage -Directory -Recurse | Sort-Object {$_.FullName.Length} -Descending)){
  $fanRelative=[IO.Path]::GetRelativePath($fanStage,$fanDirectory.FullName)
  $fanRemoval.Add('RMDir "$INSTDIR\'+(ConvertTo-NsisString $fanRelative)+'"')
}
$fanRemovalFile=Join-Path $fanRoot ('work\installer-removal-'+[Guid]::NewGuid().ToString('N')+'.nsh')
[IO.File]::WriteAllLines($fanRemovalFile,$fanRemoval,[Text.UTF8Encoding]::new($false))
$fanOutput=Join-Path $fanRoot ('dist\FanController-v'+$fanMetadata.version+'-windows-x64-setup.exe')
if($InstallerQaRoot){$fanOutput=Join-Path $InstallerQaRoot ('FanController-v'+$fanMetadata.version+'-installer-ui-qa-'+$InstallerQaLanguage+'.exe')}
$fanArguments=@('/V2','/INPUTCHARSET','UTF8',('/DProjectRoot='+$fanRoot),('/DAppVersion='+$fanMetadata.version),('/DPayload='+$fanStage),('/DBootstrapper='+$fanBootstrapper),('/DRemovalList='+$fanRemovalFile),('/DInstalledSizeKB='+[Math]::Ceiling($fanSize/1024)),('/DOutputFile='+$fanOutput))+$fanQaArguments+@((Join-Path $fanRoot 'installer\setup.nsi'))
& $CompilerPath @fanArguments
if($LASTEXITCODE -ne 0){throw 'NSIS installer compilation failed.'}
$fanHash=(Get-FileHash -LiteralPath $fanOutput -Algorithm SHA256).Hash.ToLowerInvariant()
($fanHash+'  '+[IO.Path]::GetFileName($fanOutput)) | Set-Content -LiteralPath ($fanOutput+'.sha256') -Encoding ascii
Write-Output $fanOutput
