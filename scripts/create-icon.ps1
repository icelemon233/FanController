$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$fanRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fanSource=Join-Path $fanRoot 'docs\brand\cinna-app-icon.png'
$fanNativeFolder=Join-Path $fanRoot 'native\assets'
$fanWebFolder=Join-Path $fanRoot 'frontend\src\assets'
$fanInstallerFolder=Join-Path $fanRoot 'installer\assets'
New-Item -ItemType Directory -Force -Path $fanNativeFolder,$fanWebFolder,$fanInstallerFolder | Out-Null

function Write-FanInstallerBitmap {
  param([Drawing.Image]$Source,[string]$Path,[int]$Width,[int]$Height,[int]$IconSize,[int]$Left,[int]$Top,[int]$Radius)
  $canvas=[Drawing.Bitmap]::new($Width,$Height,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $canvasGraphics=[Drawing.Graphics]::FromImage($canvas)
  $icon=[Drawing.Bitmap]::new($IconSize,$IconSize,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $iconGraphics=[Drawing.Graphics]::FromImage($icon)
  $outline=[Drawing.Drawing2D.GraphicsPath]::new()
  $attributes=[Drawing.Imaging.ImageAttributes]::new()
  try {
    $canvasGraphics.Clear([Drawing.Color]::FromArgb(255,252,246))
    $iconGraphics.Clear([Drawing.Color]::Transparent)
    $diameter=2*$Radius
    $edge=$IconSize-1
    $outline.AddArc(0,0,$diameter,$diameter,180,90)
    $outline.AddArc(($edge-$diameter),0,$diameter,$diameter,270,90)
    $outline.AddArc(($edge-$diameter),($edge-$diameter),$diameter,$diameter,0,90)
    $outline.AddArc(0,($edge-$diameter),$diameter,$diameter,90,90)
    $outline.CloseFigure()
    $iconGraphics.SetClip($outline)
    $iconGraphics.CompositingQuality=[Drawing.Drawing2D.CompositingQuality]::HighQuality
    $iconGraphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $iconGraphics.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $attributes.SetWrapMode([Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $iconGraphics.DrawImage($Source,[Drawing.Rectangle]::new(0,0,$IconSize,$IconSize),0,0,$Source.Width,$Source.Height,[Drawing.GraphicsUnit]::Pixel,$attributes)
    $canvasGraphics.DrawImageUnscaled($icon,$Left,$Top)
    $canvas.Save($Path,[Drawing.Imaging.ImageFormat]::Bmp)
  } finally {$attributes.Dispose();$outline.Dispose();$iconGraphics.Dispose();$icon.Dispose();$canvasGraphics.Dispose();$canvas.Dispose()}
}

$fanInstallerImages=@(
  [ordered]@{file='installer-sidebar.bmp';width=164;height=314;iconSize=148;left=8;top=58;radius=32},
  [ordered]@{file='installer-header.bmp';width=150;height=57;iconSize=48;left=98;top=4;radius=11}
)
$fanImages=[Collections.Generic.List[byte[]]]::new()
$fanSizes=@(16,20,24,32,40,48,64,96,128,256)
$fanOriginal=[Drawing.Image]::FromFile($fanSource)
try {
  if($fanOriginal.Width -ne $fanOriginal.Height -or $fanOriginal.Width -lt 256){throw 'The Cinna icon source must be square and at least 256 pixels wide.'}
  foreach($fanSize in $fanSizes){
    $fanBitmap=[Drawing.Bitmap]::new($fanSize,$fanSize,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $fanGraphics=[Drawing.Graphics]::FromImage($fanBitmap)
    $fanAttributes=[Drawing.Imaging.ImageAttributes]::new()
    $fanStream=[IO.MemoryStream]::new()
    try {
      $fanGraphics.Clear([Drawing.Color]::Transparent)
      $fanGraphics.CompositingMode=[Drawing.Drawing2D.CompositingMode]::SourceCopy
      $fanGraphics.CompositingQuality=[Drawing.Drawing2D.CompositingQuality]::HighQuality
      $fanGraphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $fanGraphics.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $fanAttributes.SetWrapMode([Drawing.Drawing2D.WrapMode]::TileFlipXY)
      $fanGraphics.DrawImage($fanOriginal,[Drawing.Rectangle]::new(0,0,$fanSize,$fanSize),0,0,$fanOriginal.Width,$fanOriginal.Height,[Drawing.GraphicsUnit]::Pixel,$fanAttributes)
      $fanBitmap.Save($fanStream,[Drawing.Imaging.ImageFormat]::Png)
      $fanImages.Add($fanStream.ToArray())
    } finally {$fanStream.Dispose();$fanAttributes.Dispose();$fanGraphics.Dispose();$fanBitmap.Dispose()}
  }
  foreach($fanInstallerImage in $fanInstallerImages){
    $fanInstallerPath=Join-Path $fanInstallerFolder $fanInstallerImage.file
    Write-FanInstallerBitmap -Source $fanOriginal -Path $fanInstallerPath -Width $fanInstallerImage.width -Height $fanInstallerImage.height -IconSize $fanInstallerImage.iconSize -Left $fanInstallerImage.left -Top $fanInstallerImage.top -Radius $fanInstallerImage.radius
    $fanInstallerImage.sha256=(Get-FileHash -LiteralPath $fanInstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
} finally {$fanOriginal.Dispose()}
$fanInstallerManifest=[ordered]@{
  source='docs/brand/cinna-app-icon.png'
  sourceSha256=(Get-FileHash -LiteralPath $fanSource -Algorithm SHA256).Hash.ToLowerInvariant()
  background='#FFFCF6'
  format='RGB BMP'
  files=$fanInstallerImages
}
$fanInstallerManifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $fanInstallerFolder 'brand.json') -Encoding utf8NoBOM
$fanFile=[IO.File]::Create((Join-Path $fanNativeFolder 'app.ico'))
$fanWriter=[IO.BinaryWriter]::new($fanFile)
try {
  $fanWriter.Write([uint16]0);$fanWriter.Write([uint16]1);$fanWriter.Write([uint16]$fanSizes.Count)
  $fanOffset=6+16*$fanSizes.Count
  for($fanIndex=0;$fanIndex -lt $fanSizes.Count;$fanIndex++){
    $fanDimension=if($fanSizes[$fanIndex] -eq 256){0}else{$fanSizes[$fanIndex]}
    $fanWriter.Write([byte]$fanDimension);$fanWriter.Write([byte]$fanDimension)
    $fanWriter.Write([byte]0);$fanWriter.Write([byte]0);$fanWriter.Write([uint16]1);$fanWriter.Write([uint16]32)
    $fanWriter.Write([uint32]$fanImages[$fanIndex].Length);$fanWriter.Write([uint32]$fanOffset)
    $fanOffset+=$fanImages[$fanIndex].Length
  }
  foreach($fanImage in $fanImages){$fanWriter.Write($fanImage)}
} finally {$fanWriter.Dispose()}
Copy-Item -LiteralPath $fanSource -Destination (Join-Path $fanWebFolder 'app-icon.png') -Force
Write-Output ('Generated Cinna app icons: '+($fanSizes -join ', ')+' px, frontend PNG, and installer branding.')
