$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$fanRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fanSource=Join-Path $fanRoot 'docs\brand\cinna-app-icon.png'
$fanNativeFolder=Join-Path $fanRoot 'native\assets'
$fanWebFolder=Join-Path $fanRoot 'frontend\src\assets'
New-Item -ItemType Directory -Force -Path $fanNativeFolder,$fanWebFolder | Out-Null
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
} finally {$fanOriginal.Dispose()}
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
Write-Output ('Generated Cinna app icons: '+($fanSizes -join ', ')+' px; frontend PNG matches the source.')
