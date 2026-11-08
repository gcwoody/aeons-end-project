param(
  [string] $RepositoryRoot
)

$ErrorActionPreference = 'Stop'
$script:FallbackAllowed = $true
$script:RepositoryContentBaseUrl = 'https://raw.githubusercontent.com/gcwoody/aeons-end-project/friend-preview'
$script:ImageExtensions = @('.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg')

if (-not $RepositoryRoot) {
  $RepositoryRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$resolvedRoot = [System.IO.Path]::GetFullPath($RepositoryRoot)
$rootDrive = [System.IO.Path]::GetPathRoot($resolvedRoot)
$script:RootPath = $resolvedRoot
if ($resolvedRoot -ne $rootDrive) { $script:RootPath = $resolvedRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) }
$script:RootPrefix = $script:RootPath.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$script:UpdateDirectory = Join-Path $script:RootPath '.aeons-end-update'
$script:StatePath = Join-Path $script:UpdateDirectory 'installed-manifest.tsv'
$script:StagePath = Join-Path $script:UpdateDirectory 'staging'
$script:LockPath = Join-Path $script:UpdateDirectory 'updater.lock'
$script:Client = $null
$script:LockStream = $null

function Get-TextSha256([string] $value) {
  $algorithm = New-Object System.Security.Cryptography.SHA256Managed
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($value)
    $hashBytes = $algorithm.ComputeHash($bytes)
    return ([System.BitConverter]::ToString($hashBytes).Replace('-', '').ToLowerInvariant())
  } finally {
    $algorithm.Dispose()
  }
}

function Get-FileSha256([string] $path) {
  $algorithm = New-Object System.Security.Cryptography.SHA256Managed
  $stream = [System.IO.File]::OpenRead($path)
  try {
    $hashBytes = $algorithm.ComputeHash($stream)
    return ([System.BitConverter]::ToString($hashBytes).Replace('-', '').ToLowerInvariant())
  } finally {
    $stream.Close()
    $algorithm.Dispose()
  }
}

function Get-ContainedPath([string] $relativePath) {
  if (-not $relativePath -or $relativePath.StartsWith('/') -or $relativePath.StartsWith('\') -or $relativePath -match '^[A-Za-z]:') {
    throw "Unsafe update path: $relativePath"
  }
  if ($relativePath.Contains('\') -or $relativePath.Contains(':') -or $relativePath -match '[\x00-\x1f<>:"|?*]') {
    throw "Unsafe update path: $relativePath"
  }

  $segments = $relativePath.Split([char]'/')
  foreach ($segment in $segments) {
    if (-not $segment -or $segment -eq '.' -or $segment -eq '..' -or $segment.EndsWith('.') -or $segment.EndsWith(' ')) {
      throw "Unsafe update path: $relativePath"
    }
    if ($segment -match '^(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$') {
      throw "Unsafe update path: $relativePath"
    }
  }

  $nativePath = $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $script:RootPath $nativePath))
  if (-not $candidate.StartsWith($script:RootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Update path leaves the project folder: $relativePath"
  }
  return $candidate
}

function Assert-NoReparsePoints([string] $relativePath, [bool] $includeLeaf) {
  $rootAttributes = [System.IO.File]::GetAttributes($script:RootPath)
  if (($rootAttributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'The project folder is a junction or symbolic link. Move the project to a regular folder before updating.'
  }

  if (-not $relativePath) { return }
  $segments = $relativePath.Replace('\', '/').Split([char]'/')
  $currentPath = $script:RootPath
  for ($index = 0; $index -lt $segments.Length; $index++) {
    if (-not $includeLeaf -and $index -eq ($segments.Length - 1)) { break }
    $currentPath = Join-Path $currentPath $segments[$index]
    if (Test-Path -LiteralPath $currentPath) {
      $attributes = [System.IO.File]::GetAttributes($currentPath)
      if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Update path contains a junction or symbolic link: $relativePath"
      }
    }
  }
}

function Ensure-ContainedDirectory([string] $relativePath) {
  if (-not $relativePath) { return }
  $segments = $relativePath.Replace('\', '/').Split([char]'/')
  $currentPath = $script:RootPath
  foreach ($segment in $segments) {
    $currentPath = Join-Path $currentPath $segment
    if (Test-Path -LiteralPath $currentPath) {
      $attributes = [System.IO.File]::GetAttributes($currentPath)
      if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Update directory contains a junction or symbolic link: $relativePath"
      }
      if (($attributes -band [System.IO.FileAttributes]::Directory) -eq 0) {
        throw "A file blocks the update directory: $currentPath"
      }
    } else {
      New-Item -ItemType Directory -Path $currentPath | Out-Null
    }
  }
}

function Remove-ContainedTree([string] $relativePath) {
  $treePath = Get-ContainedPath $relativePath
  if (-not (Test-Path -LiteralPath $treePath)) { return }
  $attributes = [System.IO.File]::GetAttributes($treePath)
  if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or ($attributes -band [System.IO.FileAttributes]::Directory) -eq 0) {
    throw "Refusing to clean an unsafe update directory: $relativePath"
  }

  $directories = New-Object System.Collections.Stack
  $directories.Push($treePath)
  while ($directories.Count -gt 0) {
    $directory = [string]$directories.Pop()
    foreach ($entry in [System.IO.Directory]::GetFileSystemEntries($directory)) {
      $entryAttributes = [System.IO.File]::GetAttributes($entry)
      if (($entryAttributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing to clean an update directory containing a junction or symbolic link: $relativePath"
      }
      if (($entryAttributes -band [System.IO.FileAttributes]::Directory) -ne 0) { $directories.Push($entry) }
    }
  }
  Remove-Item -LiteralPath $treePath -Recurse -Force
}

function Test-AllowedPayloadPath([string] $relativePath) {
  if ($relativePath -eq 'play-local-demo.ps1') { return $true }
  if ($relativePath.StartsWith('local-demo-site/', [System.StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }
  if ($relativePath.StartsWith('image-database/', [System.StringComparison]::OrdinalIgnoreCase)) {
    return $script:ImageExtensions -contains [System.IO.Path]::GetExtension($relativePath).ToLowerInvariant()
  }
  return $false
}

function ConvertTo-UpdateManifest([string] $content) {
  if ($content.Length -gt 4194304) { throw 'The update manifest is unexpectedly large.' }
  if ($content.Length -gt 0 -and [int][char]$content[0] -eq 65279) { $content = $content.Substring(1) }

  $content = $content.TrimEnd([char[]]@("`r", "`n"))
  $lines = [System.Text.RegularExpressions.Regex]::Split($content, '\r?\n')
  if ($lines.Length -lt 2) { throw 'The update manifest is empty or incomplete.' }

  $header = $lines[0].Split([char]9)
  if ($header.Length -ne 3 -or $header[0] -ne 'AEONS_END_LOCAL_UPDATE' -or $header[1] -ne '1' -or $header[2] -notmatch '^[0-9a-f]{64}$') {
    throw 'The update manifest header is invalid.'
  }

  $entries = New-Object System.Collections.ArrayList
  $rows = New-Object System.Collections.ArrayList
  $entryIndex = @{}
  for ($lineIndex = 1; $lineIndex -lt $lines.Length; $lineIndex++) {
    $line = $lines[$lineIndex]
    if (-not $line) { continue }
    $fields = $line.Split([char]9)
    if ($fields.Length -ne 4 -or $fields[0] -ne 'F' -or $fields[1] -notmatch '^[0-9a-f]{64}$' -or $fields[2] -notmatch '^[0-9]+$') {
      throw "The update manifest contains an invalid entry on line $($lineIndex + 1)."
    }
    $size = [long]::Parse($fields[2], [System.Globalization.CultureInfo]::InvariantCulture)
    $relativePath = $fields[3]
    $targetPath = Get-ContainedPath $relativePath
    if (-not (Test-AllowedPayloadPath $relativePath)) { throw "The update manifest contains a disallowed path: $relativePath" }

    $key = $relativePath.ToLowerInvariant()
    $entry = New-Object PSObject -Property @{ Hash = $fields[1]; Size = $size; RelativePath = $relativePath; TargetPath = $targetPath }
    if ($entryIndex.ContainsKey($key)) { throw "The update manifest contains a duplicate path: $relativePath" }
    $entryIndex[$key] = $entry
    [void]$entries.Add($entry)
    [void]$rows.Add(($fields -join "`t"))
  }
  if ($entries.Count -eq 0) { throw 'The update manifest contains no files.' }

  $body = [System.String]::Join("`n", $rows.ToArray()) + "`n"
  if ((Get-TextSha256 $body) -ne $header[2]) { throw 'The update manifest checksum is invalid.' }
  return (New-Object PSObject -Property @{ Version = $header[2]; Entries = $entries; ByPath = $entryIndex })
}

function Get-EncodedPayloadUrl([string] $relativePath) {
  $segments = $relativePath.Split([char]'/')
  $encodedSegments = New-Object System.Collections.ArrayList
  foreach ($segment in $segments) { [void]$encodedSegments.Add([System.Uri]::EscapeDataString($segment)) }
  return ($script:RepositoryContentBaseUrl + '/' + [System.String]::Join('/', $encodedSegments.ToArray()))
}

function Get-LocalEntryStatus($entry) {
  if (-not (Test-Path -LiteralPath $entry.TargetPath -PathType Leaf)) { return 'download' }
  Assert-NoReparsePoints $entry.RelativePath $true
  $fileInfo = Get-Item -LiteralPath $entry.TargetPath
  if ([long]$fileInfo.Length -ne [long]$entry.Size) { return 'download' }
  return 'same-size'
}

function Restore-Changes($changes) {
  $succeeded = $true
  for ($index = $changes.Count - 1; $index -ge 0; $index--) {
    $change = $changes[$index]
    try {
      $relativeTarget = $change.RelativePath
      Assert-NoReparsePoints $relativeTarget $true
      if (Test-Path -LiteralPath $change.TargetPath) {
        $targetAttributes = [System.IO.File]::GetAttributes($change.TargetPath)
        if (($targetAttributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or ($targetAttributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
          throw "Cannot safely restore $relativeTarget"
        }
        Remove-Item -LiteralPath $change.TargetPath -Force
      }
      if ($change.HadOriginal -and (Test-Path -LiteralPath $change.BackupPath -PathType Leaf)) {
        Assert-NoReparsePoints $change.BackupRelativePath $true
        $parentRelative = [System.IO.Path]::GetDirectoryName($relativeTarget)
        if ($parentRelative) { Ensure-ContainedDirectory $parentRelative }
        [System.IO.File]::Move($change.BackupPath, $change.TargetPath)
      }
    } catch {
      $succeeded = $false
      Write-Host "Could not restore $($change.RelativePath): $($_.Exception.Message)" -ForegroundColor Red
    }
  }
  return $succeeded
}

function Test-ExistingLocalServer {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $client.Connect([System.Net.IPAddress]::Loopback, 47381)
    $stream = $client.GetStream()
    $stream.ReadTimeout = 1000
    $request = [System.Text.Encoding]::ASCII.GetBytes("GET /__aeons_end_local_server_check__ HTTP/1.1`r`nHost: 127.0.0.1`r`nConnection: close`r`n`r`n")
    $stream.Write($request, 0, $request.Length)
    $reader = New-Object -TypeName System.IO.StreamReader -ArgumentList $stream
    return ($reader.ReadLine() -match '^HTTP/1\.1 204 ')
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Invoke-LocalUpdate {
  $hasLocalSite = Test-Path -LiteralPath (Join-Path $script:RootPath 'local-demo-site\index.html') -PathType Leaf
  $hasLocalImages = Test-Path -LiteralPath (Join-Path $script:RootPath 'image-database') -PathType Container

  try {
    if (-not (Test-Path -LiteralPath $script:RootPath -PathType Container)) { throw 'The project folder could not be found.' }
    Assert-NoReparsePoints '' $true
    if (Test-ExistingLocalServer) {
      Write-Host 'The local game is already running. Skipping this update check.' -ForegroundColor Green
      return 0
    }
    Ensure-ContainedDirectory '.aeons-end-update'
    Assert-NoReparsePoints '.aeons-end-update/updater.lock' $true
    try {
      $script:LockStream = [System.IO.File]::Open($script:LockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    } catch {
      $script:FallbackAllowed = $false
      throw 'Another updater is already running. Wait for it to finish, then run the launcher again.'
    }

    try { [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]3072 } catch { }
    $script:Client = New-Object System.Net.WebClient
    $script:Client.Headers.Add('User-Agent', 'AeonsEndDigital-LocalUpdater/1.0')
    $manifestBytes = $script:Client.DownloadData($script:RepositoryContentBaseUrl + '/local-update-manifest.tsv')
    if ($manifestBytes.Length -gt 4194304) { throw 'The update manifest is unexpectedly large.' }
    $remoteManifest = ConvertTo-UpdateManifest ([System.Text.Encoding]::UTF8.GetString($manifestBytes))

    $previousManifest = $null
    if (Test-Path -LiteralPath $script:StatePath -PathType Leaf) {
      try {
        Assert-NoReparsePoints '.aeons-end-update/installed-manifest.tsv' $true
        $previousManifest = ConvertTo-UpdateManifest ([System.IO.File]::ReadAllText($script:StatePath, [System.Text.Encoding]::UTF8))
      } catch {
        Write-Host 'The saved update record is invalid. The updater will check the local files once.' -ForegroundColor Yellow
        $previousManifest = $null
      }
    }

    $entriesToDownload = New-Object System.Collections.ArrayList
    $siteFilesToRemove = New-Object System.Collections.ArrayList
    if ($previousManifest -and $previousManifest.Version -eq $remoteManifest.Version) {
      foreach ($entry in $remoteManifest.Entries) {
        if ((Get-LocalEntryStatus $entry) -eq 'download') { [void]$entriesToDownload.Add($entry) }
      }
      if ($entriesToDownload.Count -eq 0) {
        Write-Host 'Your local game is up to date.' -ForegroundColor Green
        return 0
      }
    } else {
      foreach ($entry in $remoteManifest.Entries) {
        $needsDownload = $true
        if ($previousManifest -and $previousManifest.ByPath.ContainsKey($entry.RelativePath.ToLowerInvariant())) {
          $oldEntry = $previousManifest.ByPath[$entry.RelativePath.ToLowerInvariant()]
          if ($oldEntry -and $oldEntry.Hash -eq $entry.Hash -and (Get-LocalEntryStatus $entry) -ne 'download') { $needsDownload = $false }
        } elseif (-not $previousManifest -and (Get-LocalEntryStatus $entry) -eq 'same-size') {
          if ((Get-FileSha256 $entry.TargetPath) -eq $entry.Hash) { $needsDownload = $false }
        }
        if ($needsDownload) { [void]$entriesToDownload.Add($entry) }
      }

      if ($previousManifest) {
        foreach ($oldEntry in $previousManifest.Entries) {
          if ($oldEntry.RelativePath.StartsWith('local-demo-site/', [System.StringComparison]::OrdinalIgnoreCase) -and -not $remoteManifest.ByPath.ContainsKey($oldEntry.RelativePath.ToLowerInvariant())) {
            [void]$siteFilesToRemove.Add($oldEntry)
          }
        }
      }
    }

    Remove-ContainedTree '.aeons-end-update/staging'
    Ensure-ContainedDirectory '.aeons-end-update/staging'
    $stagePrefix = '.aeons-end-update/staging/'
    $downloadedCount = 0
    foreach ($entry in $entriesToDownload) {
      $stageRelativePath = $stagePrefix + 'payload/' + $entry.RelativePath
      $stageFilePath = Get-ContainedPath $stageRelativePath
      $stageDirectory = [System.IO.Path]::GetDirectoryName($stageRelativePath)
      Ensure-ContainedDirectory $stageDirectory
      Assert-NoReparsePoints $stageRelativePath $true
      $script:Client.DownloadFile((Get-EncodedPayloadUrl $entry.RelativePath), $stageFilePath)
      $downloadInfo = Get-Item -LiteralPath $stageFilePath
      if ([long]$downloadInfo.Length -ne [long]$entry.Size -or (Get-FileSha256 $stageFilePath) -ne $entry.Hash) {
        throw "The downloaded file did not pass verification: $($entry.RelativePath)"
      }
      $downloadedCount++
    }

    $stagedStatePath = Join-Path $script:StagePath 'new-installed-manifest.tsv'
    $stateText = 'AEONS_END_LOCAL_UPDATE' + "`t" + '1' + "`t" + $remoteManifest.Version + "`n"
    foreach ($entry in $remoteManifest.Entries) {
      $stateText += 'F' + "`t" + $entry.Hash + "`t" + $entry.Size + "`t" + $entry.RelativePath + "`n"
    }
    Assert-NoReparsePoints '.aeons-end-update/staging/new-installed-manifest.tsv' $true
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
    [System.IO.File]::WriteAllText($stagedStatePath, $stateText, $utf8WithoutBom)

    $changes = New-Object System.Collections.ArrayList
    try {
      foreach ($entry in $entriesToDownload) {
        $targetPath = $entry.TargetPath
        Assert-NoReparsePoints $entry.RelativePath $true
        $parentRelative = [System.IO.Path]::GetDirectoryName($entry.RelativePath)
        if ($parentRelative) { Ensure-ContainedDirectory $parentRelative }
        $stageRelativePath = $stagePrefix + 'payload/' + $entry.RelativePath
        $stageFilePath = Get-ContainedPath $stageRelativePath
        $backupRelativePath = $stagePrefix + 'backup/' + $entry.RelativePath
        $backupPath = Get-ContainedPath $backupRelativePath
        $hadOriginal = $false
        if (Test-Path -LiteralPath $targetPath) {
          $attributes = [System.IO.File]::GetAttributes($targetPath)
          if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or ($attributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
            throw "Refusing to replace an unsafe file: $($entry.RelativePath)"
          }
          $backupDirectory = [System.IO.Path]::GetDirectoryName($backupRelativePath)
          Ensure-ContainedDirectory $backupDirectory
          [System.IO.File]::Move($targetPath, $backupPath)
          $hadOriginal = $true
        }
        $change = New-Object PSObject -Property @{ RelativePath = $entry.RelativePath; TargetPath = $targetPath; BackupPath = $backupPath; BackupRelativePath = $backupRelativePath; HadOriginal = $hadOriginal }
        [void]$changes.Add($change)
        [System.IO.File]::Move($stageFilePath, $targetPath)
      }

      foreach ($oldEntry in $siteFilesToRemove) {
        $targetPath = Get-ContainedPath $oldEntry.RelativePath
        Assert-NoReparsePoints $oldEntry.RelativePath $true
        if (Test-Path -LiteralPath $targetPath -PathType Leaf) {
          $backupRelativePath = $stagePrefix + 'backup/' + $oldEntry.RelativePath
          $backupPath = Get-ContainedPath $backupRelativePath
          Ensure-ContainedDirectory ([System.IO.Path]::GetDirectoryName($backupRelativePath))
          [System.IO.File]::Move($targetPath, $backupPath)
          $change = New-Object PSObject -Property @{ RelativePath = $oldEntry.RelativePath; TargetPath = $targetPath; BackupPath = $backupPath; BackupRelativePath = $backupRelativePath; HadOriginal = $true }
          [void]$changes.Add($change)
        }
      }

      $stateRelativePath = '.aeons-end-update/installed-manifest.tsv'
      Assert-NoReparsePoints $stateRelativePath $true
      $stateBackupRelativePath = $stagePrefix + 'backup/installed-manifest.tsv'
      $stateBackupPath = Get-ContainedPath $stateBackupRelativePath
      $hadState = $false
      if (Test-Path -LiteralPath $script:StatePath -PathType Leaf) {
        Ensure-ContainedDirectory ([System.IO.Path]::GetDirectoryName($stateBackupRelativePath))
        [System.IO.File]::Move($script:StatePath, $stateBackupPath)
        $hadState = $true
      }
      $stateChange = New-Object PSObject -Property @{ RelativePath = $stateRelativePath; TargetPath = $script:StatePath; BackupPath = $stateBackupPath; BackupRelativePath = $stateBackupRelativePath; HadOriginal = $hadState }
      [void]$changes.Add($stateChange)
      [System.IO.File]::Move($stagedStatePath, $script:StatePath)
    } catch {
      $rollbackSucceeded = Restore-Changes $changes
      if (-not $rollbackSucceeded) {
        $script:FallbackAllowed = $false
        throw 'The update failed and rollback was incomplete. Do not launch the local game; restore the project from its original ZIP.'
      }
      throw
    }

    Remove-ContainedTree '.aeons-end-update/staging'
    if ($downloadedCount -gt 0) {
      Write-Host "Updated $downloadedCount file(s)." -ForegroundColor Green
    } else {
      Write-Host 'Your local game is up to date.' -ForegroundColor Green
    }
    return 0
  } catch {
    Write-Host "The automatic update could not be completed: $($_.Exception.Message)" -ForegroundColor Yellow
    if ($script:FallbackAllowed -and $hasLocalSite -and $hasLocalImages) {
      Write-Host 'Starting the installed local version. It will try updating again next time.' -ForegroundColor Yellow
      return 0
    }
    Write-Host 'No complete local version is available. Connect to the internet and run the launcher again, or download the full project ZIP.' -ForegroundColor Red
    return 1
  } finally {
    if ($script:Client) { $script:Client.Dispose() }
    if ($script:LockStream) { $script:LockStream.Close() }
  }
}

$exitCode = Invoke-LocalUpdate
exit $exitCode
