<#
.SYNOPSIS
    Codex Draft Wrapper for DeliveryK Adversarial Cross-Validation Pipeline

.DESCRIPTION
    Invokes Codex (ChatGPT) in read-only mode via VS Code extension.
    Part of Claude <-> Codex cross-validation (stage ②).

.PARAMETER Task
    Task/instruction string or path to _task.md file

.PARAMETER Repo
    Target repository root path (default: C:\Mywork)

.PARAMETER Out
    Output file path (default: %TEMP%\claude\<RepoHash>\codex_draft_<timestamp>.md)

.PARAMETER SkipAuth
    Skip authentication check (not recommended)

.EXAMPLE
    & .\codex-draft.ps1 -Task "Review this code for security issues" -Repo C:\myproject -Out C:\review.md

.NOTES
    Requires: VS Code + ChatGPT/Codex extension (openai.chatgpt-*) with auth completed
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Task,

    [Parameter(Mandatory=$false)]
    [string]$Repo = 'C:\Mywork',

    [Parameter(Mandatory=$false)]
    [string]$Out,

    [Parameter(Mandatory=$false)]
    [switch]$SkipAuth
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Force UTF-8 encoding for this session
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::UTF8

function Log {
    param([string]$Msg, [ValidateSet('Info','Warn','Error')]$Level='Info')
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $prefix = switch($Level) {
        'Info' { '[codex-draft]' }
        'Warn' { '[codex-draft:WARN]' }
        'Error' { '[codex-draft:ERROR]' }
    }
    Write-Host "$prefix $Msg" -ForegroundColor $(if($Level -eq 'Error'){'Red'} elseif($Level -eq 'Warn'){'Yellow'} else {'Gray'})
}

try {
    # 1. Find ChatGPT extension and codex.exe
    Log "Searching for Codex executable..."
    $extPath = "$env:USERPROFILE\.vscode\extensions"
    if (-not (Test-Path $extPath)) {
        throw "VS Code extensions directory not found: $extPath"
    }

    $codexExes = @(Get-ChildItem -Path $extPath -Filter 'codex.exe' -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like '*openai.chatgpt*' } |
        Sort-Object -Property FullName -Descending)

    if ($codexExes.Count -eq 0) {
        throw "Codex executable not found. Install ChatGPT VS Code extension (openai.chatgpt-*) and ensure auth is completed."
    }

    $codexExe = $codexExes[0].FullName
    Log "Found Codex: $codexExe"

    # 2. Validate Repo path
    if (-not (Test-Path -LiteralPath $Repo -PathType Container)) {
        throw "Repository path not found: $Repo"
    }
    $Repo = (Get-Item -LiteralPath $Repo).FullName
    Log "Repository: $Repo"

    # 3. Handle Task input (string or file path)
    if (Test-Path -LiteralPath $Task -PathType Leaf) {
        Log "Reading task from file: $Task"
        $TaskContent = Get-Content -LiteralPath $Task -Raw -Encoding UTF8
    } else {
        $TaskContent = $Task
    }

    if ($TaskContent.Length -eq 0) {
        throw "Task is empty"
    }
    Log "Task length: $($TaskContent.Length) characters"

    # 4. Set output path
    if (-not $Out) {
        $repoHash = [Math]::Abs($Repo.GetHashCode()).ToString().Substring(0, 8)
        $tempBase = Join-Path $env:TEMP "claude\$repoHash\codex_drafts"
        if (-not (Test-Path $tempBase)) {
            New-Item -ItemType Directory -Path $tempBase -Force | Out-Null
        }
        $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
        $Out = Join-Path $tempBase "codex_draft_$timestamp.md"
    }

    $outDir = Split-Path -Parent $Out
    if (-not (Test-Path $outDir)) {
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }

    Log "Output file: $Out"

    # 5. Prepare prompt for Codex
    $prompt = @"
You are a security and correctness reviewer. Your role is adversarial: assume the document/code below is WRONG and find errors, contradictions, missing information.

IMPORTANT RULES:
1. Read the original source code/documents first
2. Identify: confirmed errors | needs verification | unfounded claims
3. For each finding: cite the exact file path and line number
4. Do NOT modify any project files (read-only mode)
5. Format findings clearly with file:line references
6. Separate high/medium/low severity
7. Note what you COULD NOT verify (due to missing context/access)

## Task
$(Get-Content -LiteralPath $Task -Raw -Encoding UTF8 -ErrorAction SilentlyContinue)

## Your Response
Output your adversarial review:
- **Confirmed Errors** (with file:line proof)
- **Needs Verification** (why uncertain)
- **Unfounded/Rejected** (why not credible)
- **Unable to Verify** (missing info/access)
"@

    # 6. Invoke Codex
    Log "Invoking Codex..."
    $liveLog = [System.IO.Path]::ChangeExtension($Out, '.live.log')

    & $codexExe exec `
        -s read-only `
        --skip-git-repo-check `
        -C $Repo `
        -o $Out `
        -p $prompt 2>&1 | Tee-Object -FilePath $liveLog

    if ($LASTEXITCODE -ne 0) {
        throw "Codex exec failed (exit code: $LASTEXITCODE). Check auth, network, and repository access."
    }

    # 7. Verify output
    if (-not (Test-Path -LiteralPath $Out)) {
        throw "Draft file was not created: $Out"
    }

    Log "✓ Success."
    Write-Host "[codex-draft] done. draft file: $Out"
    Write-Host "[codex-draft] live log: $liveLog"

} catch {
    Log "ERROR: $_" -Level Error
    Write-Host "Stack trace:" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace
    exit 1
}
