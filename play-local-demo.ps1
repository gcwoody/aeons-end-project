param(
  [switch] $NoOpenBrowser,
  [string] $RepositoryRoot
)

$ErrorActionPreference = 'Stop'

if (-not $RepositoryRoot) {
  $RepositoryRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$siteRoot = Join-Path $RepositoryRoot 'local-demo-site'
$imageRoot = Join-Path $RepositoryRoot 'image-database'
$port = 47381
$address = [System.Net.IPAddress]::Loopback
$baseUrl = "http://127.0.0.1:$port/"

if (-not (Test-Path -LiteralPath (Join-Path $siteRoot 'index.html'))) {
  Write-Host '缺少本地游戏网页文件。请先完整解压游戏压缩包。' -ForegroundColor Red
  exit 1
}
if (-not (Test-Path -LiteralPath $imageRoot -PathType Container)) {
  Write-Host '缺少图片资源文件夹。请先完整解压游戏压缩包。' -ForegroundColor Red
  exit 1
}

function Get-ContentType([string] $path) {
  switch ([System.IO.Path]::GetExtension($path).ToLowerInvariant()) {
    '.html' { return 'text/html; charset=utf-8' }
    '.js' { return 'text/javascript; charset=utf-8' }
    '.css' { return 'text/css; charset=utf-8' }
    '.json' { return 'application/json; charset=utf-8' }
    '.svg' { return 'image/svg+xml' }
    '.png' { return 'image/png' }
    '.jpg' { return 'image/jpeg' }
    '.jpeg' { return 'image/jpeg' }
    '.webp' { return 'image/webp' }
    '.avif' { return 'image/avif' }
    '.ico' { return 'image/x-icon' }
    default { return 'application/octet-stream' }
  }
}

function Get-SafeFilePath([string] $basePath, [string] $relativePath) {
  $base = [System.IO.Path]::GetFullPath($basePath).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $basePath $relativePath))
  if (-not $candidate.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }
  return $candidate
}

function Send-Response(
  [System.Net.Sockets.NetworkStream] $stream,
  [int] $status,
  [string] $reason,
  [string] $contentType,
  [string] $filePath,
  [bool] $headOnly = $false,
  [string] $cacheControl = 'no-cache, must-revalidate'
) {
  $length = if ($filePath -and (Test-Path -LiteralPath $filePath -PathType Leaf)) {
    (Get-Item -LiteralPath $filePath).Length
  } else { 0 }
  $headers = "HTTP/1.1 $status $reason`r`nContent-Type: $contentType`r`nContent-Length: $length`r`nCache-Control: $cacheControl`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $stream.Write($headerBytes, 0, $headerBytes.Length)

  if (-not $headOnly -and $length -gt 0) {
    $fileStream = [System.IO.File]::OpenRead($filePath)
    try {
      $buffer = New-Object byte[] 65536
      while ($true) {
        $bytesRead = $fileStream.Read($buffer, 0, $buffer.Length)
        if ($bytesRead -le 0) { break }
        $stream.Write($buffer, 0, $bytesRead)
      }
    } finally {
      $fileStream.Close()
    }
  }
}

# Reuse one stable origin so localStorage saves remain available on later launches.
$listener = New-Object -TypeName System.Net.Sockets.TcpListener -ArgumentList $address, $port
try {
  $listener.Start()
} catch {
  $existingInstance = $false
  $probe = New-Object -TypeName System.Net.Sockets.TcpClient
  try {
    $probe.Connect($address, $port)
    $probeStream = $probe.GetStream()
    $probeStream.ReadTimeout = 1000
    $request = [System.Text.Encoding]::ASCII.GetBytes("GET /__aeons_end_local_server_check__ HTTP/1.1`r`nHost: 127.0.0.1`r`nConnection: close`r`n`r`n")
    $probeStream.Write($request, 0, $request.Length)
    $reader = New-Object -TypeName System.IO.StreamReader -ArgumentList $probeStream
    $existingInstance = $reader.ReadLine() -match '^HTTP/1\.1 204 '
  } catch {
    $existingInstance = $false
  } finally {
    $probe.Close()
  }

  if ($existingInstance) {
    if (-not $NoOpenBrowser) { Start-Process $baseUrl }
    exit 0
  }

  Write-Host "本地端口 $port 已被占用。请关闭占用该端口的程序后重试。" -ForegroundColor Red
  exit 1
}

Write-Host '正在启动 Aeon''s End Digital 本地游戏...' -ForegroundColor Cyan
Write-Host "正在打开浏览器：$baseUrl"
Write-Host '游玩期间请保持此窗口开启；关闭窗口会停止本地游戏服务。'
if (-not $NoOpenBrowser) { Start-Process $baseUrl }

try {
  while ($listener.Server.IsBound) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $stream.ReadTimeout = 5000
      $stream.WriteTimeout = 30000
      $reader = New-Object -TypeName System.IO.StreamReader -ArgumentList $stream
      $requestLine = $reader.ReadLine()
      if (-not $requestLine) { continue }

      $requestParts = $requestLine.Split(' ', 3)
      if ($requestParts.Length -lt 2) {
        Send-Response $stream 400 'Bad Request' 'text/plain; charset=utf-8' $null
        continue
      }
      $method = $requestParts[0]
      $headOnly = $method -eq 'HEAD'
      if ($method -ne 'GET' -and -not $headOnly) {
        Send-Response $stream 405 'Method Not Allowed' 'text/plain; charset=utf-8' $null
        continue
      }

      while ($true) {
        $headerLine = $reader.ReadLine()
        if ($null -eq $headerLine -or $headerLine.Length -eq 0) { break }
      }

      $requestUri = New-Object -TypeName System.Uri -ArgumentList "http://127.0.0.1:$port$($requestParts[1])"
      $requestPath = [System.Uri]::UnescapeDataString($requestUri.AbsolutePath)
      if ($requestPath -eq '/__aeons_end_local_server_check__') {
        Send-Response $stream 204 'No Content' 'text/plain' $null
        continue
      }

      if ($requestPath.StartsWith('/image-database/', [System.StringComparison]::OrdinalIgnoreCase)) {
        $relativeImagePath = $requestPath.Substring('/image-database/'.Length).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $filePath = Get-SafeFilePath $imageRoot $relativeImagePath
        if (-not $filePath -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
          Send-Response $stream 404 'Not Found' 'text/plain; charset=utf-8' $null
          continue
        }
        $cacheControl = 'public, max-age=31536000, immutable'
      } else {
        $relativeSitePath = $requestPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        if (-not $relativeSitePath) { $relativeSitePath = 'index.html' }
        $filePath = Get-SafeFilePath $siteRoot $relativeSitePath
        if (-not $filePath -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
          $filePath = Join-Path $siteRoot 'index.html'
        }
        if ($requestPath.StartsWith('/assets/', [System.StringComparison]::OrdinalIgnoreCase)) {
          $cacheControl = 'public, max-age=31536000, immutable'
        } else {
          $cacheControl = 'no-cache, must-revalidate'
        }
      }

      Send-Response $stream 200 'OK' (Get-ContentType $filePath) $filePath $headOnly $cacheControl
    } catch {
      try { Send-Response $stream 500 'Internal Server Error' 'text/plain; charset=utf-8' $null } catch { }
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
