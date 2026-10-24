$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$fanRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fanAssets=Join-Path $fanRoot 'installer\assets'
$fanBrand=Get-Content -LiteralPath (Join-Path $fanAssets 'brand.json') -Raw | ConvertFrom-Json
$fanSource=Join-Path $fanRoot $fanBrand.source
if((Get-FileHash -LiteralPath $fanSource -Algorithm SHA256).Hash -ne $fanBrand.sourceSha256){throw 'Installer branding is from an outdated icon source.'}
foreach($fanImage in $fanBrand.files){
  $fanPath=Join-Path $fanAssets $fanImage.file
  if((Get-FileHash -LiteralPath $fanPath -Algorithm SHA256).Hash -ne $fanImage.sha256){throw ('Installer bitmap checksum mismatch: '+$fanImage.file)}
  $fanBytes=[IO.File]::ReadAllBytes($fanPath)
  if($fanBytes[0] -ne 66 -or $fanBytes[1] -ne 77 -or [BitConverter]::ToUInt16($fanBytes,28) -ne 24){throw 'NSIS branding must use a 24-bit RGB BMP.'}
  $fanBitmap=[Drawing.Bitmap]::new($fanPath)
  try {
    if($fanBitmap.Width -ne $fanImage.width -or $fanBitmap.Height -ne $fanImage.height){throw 'Installer bitmap dimensions differ from the source manifest.'}
    $fanArtworkPixels=0
    for($fanY=0;$fanY -lt $fanBitmap.Height;$fanY++){
      for($fanX=0;$fanX -lt $fanBitmap.Width;$fanX++){
        $fanPixel=$fanBitmap.GetPixel($fanX,$fanY)
        $fanCream=$fanPixel.R -eq 255 -and $fanPixel.G -eq 252 -and $fanPixel.B -eq 246
        $fanInIcon=$fanX -ge $fanImage.left -and $fanX -lt ($fanImage.left+$fanImage.iconSize) -and $fanY -ge $fanImage.top -and $fanY -lt ($fanImage.top+$fanImage.iconSize)
        if(-not $fanInIcon -and -not $fanCream){throw 'Installer artwork exceeds its designated bounds or the cream background has changed.'}
        if($fanInIcon -and -not $fanCream){$fanArtworkPixels++}
      }
    }
    if($fanArtworkPixels -lt $fanImage.iconSize*$fanImage.iconSize/4){throw 'Installer artwork is missing or mostly blank.'}
  } finally {$fanBitmap.Dispose()}
}
Write-Output 'PASS: installer source identity, bitmap checksums, RGB format, dimensions, artwork bounds and cream background.'
