$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$fanRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fanFolder=Join-Path $fanRoot 'native\assets'
New-Item -ItemType Directory -Force -Path $fanFolder | Out-Null
$fanImages=[Collections.Generic.List[byte[]]]::new()
$fanSizes=@(16,32,48,256)
foreach($fanSize in $fanSizes){
  $fanBitmap=[Drawing.Bitmap]::new($fanSize,$fanSize)
  $fanGraphics=[Drawing.Graphics]::FromImage($fanBitmap)
  $fanGraphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $fanGraphics.ScaleTransform($fanSize/64.0,$fanSize/64.0)
  $fanBackground=[Drawing.Drawing2D.GraphicsPath]::new()
  foreach($fanArc in @(@(0,0,180),@(36,0,270),@(36,36,0),@(0,36,90))){$fanBackground.AddArc($fanArc[0],$fanArc[1],28,28,$fanArc[2],90)}
  $fanBackground.CloseFigure()
  $fanBrush=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#246bd1'))
  $fanGraphics.FillPath($fanBrush,$fanBackground)
  $fanGraphics.TranslateTransform(8,8)
  $fanGraphics.ScaleTransform(2,2)
  $fanBlade=[Drawing.Drawing2D.GraphicsPath]::new()
  $fanBlade.AddBezier(12,10,8,8,7,4.5,9.3,3.4)
  $fanBlade.AddBezier(9.3,3.4,12,2,14.4,3.9,14.1,6.4)
  $fanBlade.AddBezier(14.1,6.4,14,7.8,13.3,9,12,10)
  $fanBlade.CloseFigure()
  foreach($fanAngle in @(0,90,180,270)){
    $fanState=$fanGraphics.Save()
    $fanGraphics.TranslateTransform(12,12)
    $fanGraphics.RotateTransform($fanAngle)
    $fanGraphics.TranslateTransform(-12,-12)
    $fanGraphics.FillPath([Drawing.Brushes]::White,$fanBlade)
    $fanGraphics.Restore($fanState)
  }
  $fanGraphics.FillEllipse([Drawing.Brushes]::White,9.5,9.5,5,5)
  $fanStream=[IO.MemoryStream]::new()
  $fanBitmap.Save($fanStream,[Drawing.Imaging.ImageFormat]::Png)
  $fanImages.Add($fanStream.ToArray())
  $fanStream.Dispose();$fanBlade.Dispose();$fanBrush.Dispose();$fanBackground.Dispose();$fanGraphics.Dispose();$fanBitmap.Dispose()
}
$fanFile=[IO.File]::Create((Join-Path $fanFolder 'app.ico'))
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
