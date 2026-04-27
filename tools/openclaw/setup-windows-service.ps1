# tools/openclaw/setup-windows-service.ps1
#
# One-shot installer/reconfigurator for the OpenClaw triage NSSM service
# on Windows. Usage:
#
#   cd C:\path\to\rema-portal
#   .\tools\openclaw\setup-windows-service.ps1 
#       -AppId 1234567 
#       -InstallationId 12345678 
#       -PrivateKeyPath "D:\Safe\openclaw-devops.private-key.pem" 
#       -GhToken "github_pat_..."
#
# Run from an *admin* PowerShell -- NSSM service operations require elevation.
#
# What it does:
#   - Resolves $PSScriptRoot -> the OpenClaw tools dir, then the repo root
#     so paths can never be typed wrong via copy-paste.
#   - Creates / reconfigures the openclaw-triage service with the right
#     Application, AppParameters, AppDirectory, AppStdout, AppStderr, env
#     vars, and ObjectName=LocalSystem.
#   - Restarts the service and prints a final status block.
#
# Idempotent: rerun any time to update credentials or fix drift.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $AppId,
    [Parameter(Mandatory = $true)] [string] $InstallationId,
    [Parameter(Mandatory = $true)] [string] $PrivateKeyPath,
    [Parameter(Mandatory = $true)] [string] $GhToken,
    [string] $ServiceName = "openclaw-triage",
    [string] $OllamaHost = "http://localhost:11434",
    [string] $LogDir = "C:\openclaw-logs",
    # ISO date cutoff for issue triage. Issues created on/after this
    # date will be triaged; older issues are skipped so the daemon
    # doesn't flood the existing backlog with auto-triage. Leave empty
    # to disable issue triage entirely.
    [string] $IssueSince = "",
    # GitHub Projects v2 node ID (e.g. PVT_kwDOD7DDt84BUM5C) for the
    # canonical project. When set, issue triage applies Priority +
    # Story Points to the project board after posting the comment.
    # Leave empty to skip project-field writes.
    [string] $ProjectId = ""
)

$ErrorActionPreference = "Stop"

function Require-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    $adminRole = [Security.Principal.WindowsBuiltInRole]::Administrator
    if (-not $principal.IsInRole($adminRole)) {
        throw "This script must be run from an admin PowerShell window."
    }
}

function Resolve-RepoRoot {
    # $PSScriptRoot points at tools/openclaw -- the repo root is two parents up.
    $toolsOpenclaw = Split-Path -Parent $MyInvocation.PSCommandPath
    return (Resolve-Path (Join-Path $toolsOpenclaw "..\..")).Path
}

function Resolve-NodeExe {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) {
        # Common install location when winget/installer puts it under Program Files.
        $candidate = "C:\Program Files\nodejs\node.exe"
        if (Test-Path $candidate) { return $candidate }
        throw "node.exe not found. Install Node from https://nodejs.org or via 'winget install OpenJS.NodeJS.LTS'."
    }
    return $node
}

function Resolve-NssmExe {
    $nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
    if (-not $nssm) { throw "nssm.exe not found on PATH. Install via 'winget install NSSM.NSSM'." }
    return $nssm
}

function Invoke-Nssm {
    param([string[]] $NssmArgs)
    $exe = Resolve-NssmExe
    & $exe @NssmArgs
    if ($LASTEXITCODE -ne 0) {
        throw "nssm exited $LASTEXITCODE on: $($NssmArgs -join ' ')"
    }
}

function Test-PrivateKey {
    param([string] $Path)
    if (-not (Test-Path $Path)) {
        throw "Private key not found at: $Path"
    }
    # LocalSystem reads anywhere on a non-encrypted drive by default,
    # but warn early if the path is on a removable / encrypted drive
    # the user might forget about later.
    $drive = (Get-Item $Path).PSDrive.Name
    $expected = @("C", "D")
    if (-not ($expected -contains $drive)) {
        Write-Warning ("Private key is on drive {0}: -- confirm LocalSystem can read it." -f $drive)
    }
}

#  main 

Require-Admin

$repoRoot = Resolve-RepoRoot
$nodeExe = Resolve-NodeExe
$pollerJs = Join-Path $repoRoot "tools\openclaw\triage-poll.mjs"
$logFile = Join-Path $LogDir "poller.log"

if (-not (Test-Path $pollerJs)) {
    throw "Cannot find triage-poll.mjs at $pollerJs. Run this from inside the rema-portal repo."
}
Test-PrivateKey -Path $PrivateKeyPath

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

Write-Host "Resolved paths:"
Write-Host "  repo root  : $repoRoot"
Write-Host "  node exe   : $nodeExe"
Write-Host "  poller.mjs : $pollerJs"
Write-Host "  log file   : $logFile"
Write-Host "  private key: $PrivateKeyPath"
Write-Host ""

# Stop any existing instance -- nssm stop no-ops on a stopped service.
Invoke-Nssm @("stop", $ServiceName) | Out-Null

# Idempotent install: if the service exists this fails harmlessly. Drop
# the error so reruns don't crash. NSSM exits non-zero when the service
# already exists; check explicitly to keep $ErrorActionPreference happy.
$existing = & (Resolve-NssmExe) status $ServiceName 2>$null
if (-not $existing) {
    Write-Host "Installing service..."
    Invoke-Nssm @("install", $ServiceName, $nodeExe, $pollerJs)
} else {
    Write-Host "Service exists, reconfiguring..."
    Invoke-Nssm @("set", $ServiceName, "Application", $nodeExe)
    Invoke-Nssm @("set", $ServiceName, "AppParameters", $pollerJs)
}

Invoke-Nssm @("set", $ServiceName, "AppDirectory", $repoRoot)
Invoke-Nssm @("set", $ServiceName, "AppStdout", $logFile)
Invoke-Nssm @("set", $ServiceName, "AppStderr", $logFile)
Invoke-Nssm @("set", $ServiceName, "AppRotateFiles", "1")
Invoke-Nssm @("set", $ServiceName, "AppRotateBytes", "5242880")
Invoke-Nssm @("set", $ServiceName, "ObjectName", "LocalSystem")

# Build env-var array. NSSM accepts each KEY=VALUE as its own arg --
# splatting an array bypasses any shell-quoting issues.
$envVars = @(
    "OLLAMA_HOST=$OllamaHost",
    "OPENCLAW_APP_ID=$AppId",
    "OPENCLAW_INSTALLATION_ID=$InstallationId",
    "OPENCLAW_PRIVATE_KEY_PATH=$PrivateKeyPath",
    "GH_TOKEN=$GhToken"
)
if (-not [string]::IsNullOrWhiteSpace($IssueSince)) {
    $envVars += "OPENCLAW_ISSUE_SINCE=$IssueSince"
}
if (-not [string]::IsNullOrWhiteSpace($ProjectId)) {
    $envVars += "OPENCLAW_PROJECT_ID=$ProjectId"
}
Invoke-Nssm (@("set", $ServiceName, "AppEnvironmentExtra") + $envVars)

Write-Host ""
Write-Host "Starting service..."
Invoke-Nssm @("start", $ServiceName)

Start-Sleep -Seconds 2

$status = & (Resolve-NssmExe) status $ServiceName
Write-Host ""
Write-Host "Service status: $status"
Write-Host "Log file:       $logFile"
Write-Host ""
if ($status -match "RUNNING") {
    Write-Host "[OK]  Service running. Tail the log with:"
    Write-Host "    Get-Content `"$logFile`" -Wait"
} else {
    Write-Host "[WARN]   Service did not reach RUNNING. Tail the log to see why:"
    Write-Host "    Get-Content `"$logFile`" -Tail 50"
    Write-Host "Or check Windows Event Log:"
    Write-Host "    Get-WinEvent -LogName Application -MaxEvents 30 | Where-Object { `$_.ProviderName -eq 'nssm' } | Format-List TimeCreated, LevelDisplayName, Message"
}
