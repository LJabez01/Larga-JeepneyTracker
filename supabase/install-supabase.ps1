# Install Supabase CLI (Windows) - saves to C:\Tools\supabase and adds to User PATH
# Usage: Open PowerShell (as user or Administrator if installing system-wide) and run this script.

param(
    [string]$InstallDir = "C:\\Tools\\supabase",
    [switch]$SystemWide
)

function Write-Info($s){ Write-Host $s }
function Write-Err($s){ Write-Host $s -ForegroundColor Red }

Write-Info "Checking GitHub latest release for supabase/cli..."
$apiUrl = "https://api.github.com/repos/supabase/cli/releases/latest"
try {
    $release = Invoke-RestMethod -UseBasicParsing -Uri $apiUrl -ErrorAction Stop
} catch {
    Write-Err "Failed to query GitHub API: $_.Exception.Message"
    Write-Err "If you're behind a proxy or rate-limited, download the release manually: https://github.com/supabase/cli/releases"
    exit 1
}

# Prefer an .exe asset, otherwise a zip with windows in name
$asset = $release.assets | Where-Object { $_.name -match "(?i)windows.*exe$" } | Select-Object -First 1
if (-not $asset) { $asset = $release.assets | Where-Object { $_.name -match "(?i)windows" } | Select-Object -First 1 }
if (-not $asset) { Write-Err "No Windows asset found in release $($release.tag_name). Visit releases page to download manually."; exit 1 }

$assetName = $asset.name
$downloadUrl = $asset.browser_download_url
$tempPath = Join-Path $env:TEMP $assetName

Write-Info "Downloading $assetName from $($release.tag_name)..."
Invoke-WebRequest -Uri $downloadUrl -OutFile $tempPath -UseBasicParsing -ErrorAction Stop

# Prepare install directory
if ($SystemWide) {
    $InstallDir = "C:\\Program Files\\supabase"
}

if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }

# Install based on asset type
if ($assetName -like "*.zip") {
    Write-Info "Extracting zip to $InstallDir..."
    Expand-Archive -LiteralPath $tempPath -DestinationPath $InstallDir -Force
} elseif ($assetName -like "*.tar.gz" -or $assetName -like "*.tgz") {
    Write-Info "Detected tarball asset. Extracting to temporary folder..."
    $extractDir = Join-Path $env:TEMP ([System.IO.Path]::GetRandomFileName())
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    # Use tar if available (Windows 10+), else try Expand-Archive will not handle tar.gz
    try {
        tar -xzf $tempPath -C $extractDir 2>$null
    } catch {
        Write-Err "Failed to extract tarball using 'tar'. Ensure Windows tar is available or extract manually."; exit 1
    }
    # Locate the executable inside extracted files
    $foundExe = Get-ChildItem -Path $extractDir -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $foundExe) {
        # Some releases may include the binary without .exe extension; try to find a file named 'supabase'
        $foundExe = Get-ChildItem -Path $extractDir -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq 'supabase' } | Select-Object -First 1
    }
    if (-not $foundExe) {
        Write-Err "Could not find a Windows executable inside the tarball. Extracted files are in: $extractDir"; exit 1
    }
    $destExe = Join-Path $InstallDir "supabase.exe"
    Copy-Item -Path $foundExe.FullName -Destination $destExe -Force
    # Clean up extracted temp folder
    Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
} else {
    # It's likely an .exe or binary; copy and rename to supabase.exe
    $destExe = Join-Path $InstallDir "supabase.exe"
    Write-Info "Copying executable to $destExe"
    Copy-Item -Path $tempPath -Destination $destExe -Force
}

# Clean up
Remove-Item $tempPath -Force -ErrorAction SilentlyContinue

# Add to PATH (User or Machine)
if ($SystemWide) {
    $scope = 'Machine'
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', $scope)
} else {
    $scope = 'User'
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', $scope)
}

if ($currentPath -notmatch [regex]::Escape($InstallDir)) {
    $newPath = if ($currentPath -and $currentPath.Length -gt 0) { "$currentPath;$InstallDir" } else { $InstallDir }
    [Environment]::SetEnvironmentVariable('PATH', $newPath, $scope)
    Write-Info "Added $InstallDir to $scope PATH. Restart terminals to use the new PATH."
} else {
    Write-Info "$InstallDir is already in the $scope PATH."
}

Write-Info "Installation complete. Run 'supabase --version' in a NEW PowerShell window to verify."
