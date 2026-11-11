param(
  [string]$SourcePath = (Join-Path $PSScriptRoot 'assets\cover.png'),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot 'assets')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$iconPngPath = Join-Path $OutputDirectory 'app-icon.png'
$iconIcoPath = Join-Path $OutputDirectory 'app-icon.ico'
$iconSizes = @(16, 24, 32, 48, 64, 128, 256)
$sourceImage = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $SourcePath).Path)

function New-SquarePngBytes {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $stream = [System.IO.MemoryStream]::new()
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    $scale = [Math]::Min($Size / $Image.Width, $Size / $Image.Height)
    $width = [int][Math]::Round($Image.Width * $scale)
    $height = [int][Math]::Round($Image.Height * $scale)
    $left = [int][Math]::Floor(($Size - $width) / 2)
    $top = [int][Math]::Floor(($Size - $height) / 2)
    $graphics.DrawImage($Image, [System.Drawing.Rectangle]::new($left, $top, $width, $height))
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    return ,$stream.ToArray()
  }
  finally {
    $stream.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

try {
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
  $largeIcon = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $largeGraphics = [System.Drawing.Graphics]::FromImage($largeIcon)
  try {
    $largeGraphics.Clear([System.Drawing.Color]::Transparent)
    $largeGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $largeGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $largeGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $scale = [Math]::Min(1024 / $sourceImage.Width, 1024 / $sourceImage.Height)
    $width = [int][Math]::Round($sourceImage.Width * $scale)
    $height = [int][Math]::Round($sourceImage.Height * $scale)
    $left = [int][Math]::Floor((1024 - $width) / 2)
    $top = [int][Math]::Floor((1024 - $height) / 2)
    $largeGraphics.DrawImage($sourceImage, [System.Drawing.Rectangle]::new($left, $top, $width, $height))
    $largeIcon.Save($iconPngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $largeGraphics.Dispose()
    $largeIcon.Dispose()
  }

  $pngImages = @()
  foreach ($size in $iconSizes) {
    $pngImages += ,(New-SquarePngBytes -Image $sourceImage -Size $size)
  }

  $stream = [System.IO.MemoryStream]::new()
  $writer = [System.IO.BinaryWriter]::new($stream)
  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$iconSizes.Count)

    $dataOffset = 6 + (16 * $iconSizes.Count)
    for ($index = 0; $index -lt $iconSizes.Count; $index++) {
      $size = $iconSizes[$index]
      $png = $pngImages[$index]
      $dimension = if ($size -eq 256) { 0 } else { $size }
      $writer.Write([byte]$dimension)
      $writer.Write([byte]$dimension)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$png.Length)
      $writer.Write([UInt32]$dataOffset)
      $dataOffset += $png.Length
    }

    foreach ($png in $pngImages) {
      $writer.Write([byte[]]$png)
    }

    [System.IO.File]::WriteAllBytes($iconIcoPath, $stream.ToArray())
  }
  finally {
    $writer.Dispose()
    $stream.Dispose()
  }
}
finally {
  $sourceImage.Dispose()
}

Write-Output "Created $iconPngPath"
Write-Output "Created $iconIcoPath"
