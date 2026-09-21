param(
  [Parameter(Mandatory = $true)]
  [string] $InputPath,

  [Parameter(Mandatory = $true)]
  [string] $OutputPath,

  # The default keeps roughly the source image's detail while using the
  # standard Aeon's End card aspect ratio.
  [int] $Width = 680,
  [int] $Height = 994,
  [int] $Border = 18,
  [int] $WhiteThreshold = 245,
  [int] $JpegQuality = 95
)

# Normalize a card image without changing its artwork:
# 1. Detect the non-white card bounds.
# 2. Scale that card into a standard canvas with an equal white border.
# 3. Save a high-quality JPEG for use by the UI.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

if ($Width -le 2 * $Border -or $Height -le 2 * $Border) {
  throw 'Width and Height must leave room for the requested border.'
}
if ($JpegQuality -lt 1 -or $JpegQuality -gt 100) {
  throw 'JpegQuality must be between 1 and 100.'
}

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)

$source = [System.Drawing.Bitmap]::new($resolvedInput)
$canvas = $null
$graphics = $null
$encoderParameters = $null
$encoderParameter = $null
try {
  $minX = $source.Width
  $minY = $source.Height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $source.Height; $y++) {
    for ($x = 0; $x -lt $source.Width; $x++) {
      $pixel = $source.GetPixel($x, $y)
      $isNearWhite = $pixel.R -ge $WhiteThreshold -and
        $pixel.G -ge $WhiteThreshold -and
        $pixel.B -ge $WhiteThreshold
      if (-not $isNearWhite) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt $minX -or $maxY -lt $minY) {
    throw 'No non-white card content was detected. Lower WhiteThreshold or inspect the source image.'
  }

  $contentWidth = $maxX - $minX + 1
  $contentHeight = $maxY - $minY + 1
  $innerWidth = $Width - 2 * $Border
  $innerHeight = $Height - 2 * $Border

  $canvas = [System.Drawing.Bitmap]::new(
    $Width,
    $Height,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::White)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  $destination = [System.Drawing.Rectangle]::new($Border, $Border, $innerWidth, $innerHeight)
  $graphics.DrawImage(
    $source,
    $destination,
    $minX,
    $minY,
    $contentWidth,
    $contentHeight,
    [System.Drawing.GraphicsUnit]::Pixel
  )

  $extension = [System.IO.Path]::GetExtension($resolvedOutput).ToLowerInvariant()
  if ($extension -eq '.png') {
    # PNG keeps the generated white border pixel-perfect.
    $canvas.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
  } else {
    $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
      Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
    $encoderParameter = [System.Drawing.Imaging.EncoderParameter]::new(
      [System.Drawing.Imaging.Encoder]::Quality,
      [long] $JpegQuality
    )
    $encoderParameters.Param[0] = $encoderParameter
    $canvas.Save($resolvedOutput, $jpegCodec, $encoderParameters)
  }

  Write-Output ("Normalized {0} ({1}x{2}) -> {3} ({4}x{5}); source content bounds: {6},{7} to {8},{9}" -f `
    $resolvedInput, $source.Width, $source.Height, $resolvedOutput, $Width, $Height,
    $minX, $minY, $maxX, $maxY)
}
finally {
  if ($encoderParameter) { $encoderParameter.Dispose() }
  if ($encoderParameters) { $encoderParameters.Dispose() }
  if ($graphics) { $graphics.Dispose() }
  if ($canvas) { $canvas.Dispose() }
  if ($source) { $source.Dispose() }
}
