# HappyHorse Video Generation Script (PowerShell)
# Usage: .\generate-video.ps1 -ApiKey "sk-xxx" -Prompt "your prompt"

param(
    [string]$ApiKey,
    [string]$Prompt,
    [string]$ServiceUrl,
    [string]$Model,
    [string]$Duration,
    [string]$Size,
    [string]$DownloadDir,
    [string]$TimeoutSeconds,
    [string]$PollIntervalMs,
    [switch]$SkipProjectDownload,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath = Join-Path $ScriptDir "generate-video.js"

if ($Help) {
    node $ScriptPath --help
    exit 0
}

$nodeArgs = @($ScriptPath)

if ($ApiKey) {
    $nodeArgs += "--api-key"
    $nodeArgs += $ApiKey
}

if ($Prompt) {
    $nodeArgs += "--prompt"
    $nodeArgs += $Prompt
}

if ($ServiceUrl) {
    $nodeArgs += "--service-url"
    $nodeArgs += $ServiceUrl
}

if ($Model) {
    $nodeArgs += "--model"
    $nodeArgs += $Model
}

if ($Duration) {
    $nodeArgs += "--duration"
    $nodeArgs += $Duration
}

if ($Size) {
    $nodeArgs += "--size"
    $nodeArgs += $Size
}

if ($DownloadDir) {
    $nodeArgs += "--download-dir"
    $nodeArgs += $DownloadDir
}

if ($TimeoutSeconds) {
    $nodeArgs += "--timeout-seconds"
    $nodeArgs += $TimeoutSeconds
}

if ($PollIntervalMs) {
    $nodeArgs += "--poll-interval-ms"
    $nodeArgs += $PollIntervalMs
}

if ($SkipProjectDownload) {
    $nodeArgs += "--skip-project-download"
}

& node @nodeArgs
