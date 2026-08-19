[CmdletBinding()]
param(
  [string]$Repo = 'rashidpvt420-lang/bin-group-super-app',
  [string]$Branch = 'main',
  [string]$Environment = 'production',
  [string]$KeyAlias = 'bin-group-upload',
  [string]$OutputRoot = (Join-Path $HOME '.bin-group/android-signing'),
  [switch]$SkipAndroidRotation,
  [switch]$GooglePlayResetConfirmed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ApiVersion = '2026-03-10'
$CompromisedUploadCertSha256 = '431AEC82D731F2A6ED2521AC529722FCB4A51614AC857A20AB96DA2D767BEE91'
$RequiredChecks = @(
  'Install, build, and test',
  'Install, typecheck, lint, and build',
  'audit'
)
$AndroidSecretNames = @(
  'ANDROID_UPLOAD_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD'
)

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found."
  }
}

function Invoke-GhApiJson {
  param(
    [Parameter(Mandatory = $true)][string]$Endpoint,
    [ValidateSet('GET','POST','PUT')][string]$Method = 'GET',
    [string]$InputJson = ''
  )

  $args = @(
    'api',
    '--method', $Method,
    '-H', 'Accept: application/vnd.github+json',
    '-H', "X-GitHub-Api-Version: $ApiVersion",
    $Endpoint
  )

  if ($InputJson) {
    $InputJson | & gh @args --input -
  } else {
    & gh @args
  }

  if ($LASTEXITCODE -ne 0) {
    throw "GitHub API call failed: $Method $Endpoint"
  }
}

function New-CryptoHex([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }
  return ([System.BitConverter]::ToString($buffer)).Replace('-', '')
}

function Normalize-Sha256([string]$Value) {
  return (($Value -replace '[^0-9A-Fa-f]', '').ToUpperInvariant())
}

Assert-Command 'gh'
Assert-Command 'keytool'

& gh auth status --hostname github.com | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub CLI is not authenticated. Run gh auth login and retry.'
}

$repoRoot = ''
if (Get-Command git -ErrorAction SilentlyContinue) {
  try {
    $repoRoot = (& git rev-parse --show-toplevel 2>$null).Trim()
  } catch {
    $repoRoot = ''
  }
}

$branchJson = Invoke-GhApiJson -Endpoint "repos/$Repo/branches/$Branch" | ConvertFrom-Json
$targetSha = [string]$branchJson.commit.sha
if ($targetSha -notmatch '^[0-9a-f]{40}$') {
  throw "Could not resolve an exact $Branch SHA."
}

$commitJson = Invoke-GhApiJson -Endpoint "repos/$Repo/commits/$targetSha" | ConvertFrom-Json
if ($commitJson.commit.verification.verified -ne $true) {
  throw "Current $Branch commit $targetSha is not cryptographically verified. Stop."
}

Write-Host "Verified release target: $targetSha"

$protection = @{
  required_status_checks = @{
    strict = $true
    contexts = $RequiredChecks
  }
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews = $true
    require_code_owner_reviews = $false
    required_approving_review_count = 0
    require_last_push_approval = $false
  }
  restrictions = $null
  required_linear_history = $true
  allow_force_pushes = $false
  allow_deletions = $false
  block_creations = $false
  required_conversation_resolution = $true
  lock_branch = $false
  allow_fork_syncing = $false
} | ConvertTo-Json -Depth 10

Write-Host 'Enabling fail-closed main branch protection...'
Invoke-GhApiJson -Endpoint "repos/$Repo/branches/$Branch/protection" -Method PUT -InputJson $protection | Out-Null
Invoke-GhApiJson -Endpoint "repos/$Repo/branches/$Branch/protection/required_signatures" -Method POST | Out-Null

$protectedBranch = Invoke-GhApiJson -Endpoint "repos/$Repo/branches/$Branch" | ConvertFrom-Json
if ($protectedBranch.protected -ne $true) {
  throw "$Branch is still not protected after the GitHub API update."
}

$signatureProtection = Invoke-GhApiJson -Endpoint "repos/$Repo/branches/$Branch/protection/required_signatures" | ConvertFrom-Json
if ($signatureProtection.enabled -ne $true) {
  throw 'Signed-commit protection is not enabled.'
}

$protectionReadback = Invoke-GhApiJson -Endpoint "repos/$Repo/branches/$Branch/protection" | ConvertFrom-Json
$actualContexts = @($protectionReadback.required_status_checks.contexts)
foreach ($requiredCheck in $RequiredChecks) {
  if ($actualContexts -notcontains $requiredCheck) {
    throw "Required status check '$requiredCheck' is missing from branch protection."
  }
}
if ($protectionReadback.enforce_admins.enabled -ne $true) {
  throw 'Branch protection is not enforced for administrators.'
}
if ($protectionReadback.allow_force_pushes.enabled -eq $true) {
  throw 'Force pushes are still allowed on main.'
}
if ($protectionReadback.allow_deletions.enabled -eq $true) {
  throw 'Branch deletion is still allowed on main.'
}

Write-Host 'GitHub main protection: PASS'
Write-Host 'Signed commit enforcement: PASS'

if ($SkipAndroidRotation) {
  Write-Host 'Android rotation skipped by explicit operator switch.'
  exit 0
}

$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
if ($repoRoot) {
  $resolvedRepoRoot = [System.IO.Path]::GetFullPath($repoRoot)
  $trimChars = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $repoPrefix = $resolvedRepoRoot.TrimEnd($trimChars) + [System.IO.Path]::DirectorySeparatorChar
  if ($resolvedOutputRoot.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or $resolvedOutputRoot -eq $resolvedRepoRoot) {
    throw 'Refusing to generate Android signing material inside the Git repository.'
  }
}

$rotationId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$rotationDir = Join-Path $resolvedOutputRoot $rotationId
New-Item -ItemType Directory -Path $rotationDir -Force | Out-Null

$keystorePath = Join-Path $rotationDir 'bin-group-upload.jks'
$pemPath = Join-Path $rotationDir 'bin-group-upload-certificate.pem'
$secretBackupPath = Join-Path $rotationDir 'github-production-android-secrets.env'
$manifestPath = Join-Path $rotationDir 'rotation-manifest.json'

if (Test-Path $keystorePath) {
  throw "Refusing to overwrite existing keystore: $keystorePath"
}

$storePassword = New-CryptoHex 32
$keyPassword = New-CryptoHex 32
$env:BIN_GROUP_ANDROID_STOREPASS = $storePassword
$env:BIN_GROUP_ANDROID_KEYPASS = $keyPassword

try {
  & keytool -genkeypair -v `
    -keystore $keystorePath `
    -alias $KeyAlias `
    -keyalg RSA `
    -keysize 4096 `
    -sigalg SHA256withRSA `
    -validity 10000 `
    -dname 'CN=BIN GROUP Android Upload, OU=Mobile Release, O=BIN GROUP General Maintenance and Property Management LLC, L=Al Ain, ST=Abu Dhabi, C=AE' `
    -storepass:env BIN_GROUP_ANDROID_STOREPASS `
    -keypass:env BIN_GROUP_ANDROID_KEYPASS
  if ($LASTEXITCODE -ne 0) {
    throw 'keytool failed to generate the replacement Android upload key.'
  }

  & keytool -exportcert -rfc `
    -keystore $keystorePath `
    -alias $KeyAlias `
    -storepass:env BIN_GROUP_ANDROID_STOREPASS `
    -file $pemPath
  if ($LASTEXITCODE -ne 0) {
    throw 'keytool failed to export the replacement upload certificate.'
  }

  $keytoolReport = & keytool -list -v `
    -keystore $keystorePath `
    -alias $KeyAlias `
    -storepass:env BIN_GROUP_ANDROID_STOREPASS
  if ($LASTEXITCODE -ne 0) {
    throw 'keytool failed to inspect the replacement upload key.'
  }

  $shaLine = $keytoolReport | Where-Object { $_ -match 'SHA256:\s*([0-9A-Fa-f:]+)' } | Select-Object -First 1
  if (-not $shaLine -or $shaLine -notmatch 'SHA256:\s*([0-9A-Fa-f:]+)') {
    throw 'Could not resolve the replacement upload certificate SHA-256 fingerprint.'
  }
  $newFingerprint = Normalize-Sha256 $Matches[1]
  if ($newFingerprint -notmatch '^[0-9A-F]{64}$') {
    throw 'Replacement upload certificate fingerprint is malformed.'
  }
  if ($newFingerprint -eq $CompromisedUploadCertSha256) {
    throw 'Generated certificate unexpectedly matches the compromised upload certificate. Stop.'
  }

  $keystoreBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($keystorePath))
  $secretLines = @(
    "ANDROID_UPLOAD_KEYSTORE_BASE64=$keystoreBase64",
    "ANDROID_KEYSTORE_PASSWORD=$storePassword",
    "ANDROID_KEY_ALIAS=$KeyAlias",
    "ANDROID_KEY_PASSWORD=$keyPassword"
  )
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($secretBackupPath, $secretLines, $utf8NoBom)

  Write-Host 'Rotating GitHub production Android signing secrets...'
  & gh secret set -f $secretBackupPath --env $Environment --repo $Repo
  if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI failed to rotate the production Android signing secrets.'
  }

  $secretRows = & gh secret list --env $Environment --repo $Repo --json name,updatedAt | ConvertFrom-Json
  foreach ($secretName in $AndroidSecretNames) {
    if (-not ($secretRows | Where-Object { $_.name -eq $secretName })) {
      throw "GitHub environment secret '$secretName' was not found after rotation."
    }
  }

  $manifest = [ordered]@{
    schemaVersion = 1
    repository = $Repo
    protectedBranch = $Branch
    targetShaAtRotation = $targetSha
    environment = $Environment
    rotationUtc = (Get-Date).ToUniversalTime().ToString('o')
    keyAlias = $KeyAlias
    uploadCertificateSha256 = $newFingerprint
    compromisedCertificateRejected = $true
    githubEnvironmentSecretsPresent = $true
    googlePlayResetConfirmed = [bool]$GooglePlayResetConfirmed
    uploadCertificatePem = $pemPath
    privateMaterialDirectory = $rotationDir
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

  Write-Host "Replacement upload certificate SHA-256: $newFingerprint"
  Write-Host "Public certificate for Google Play reset: $pemPath"
  Write-Host "Private signing backup directory: $rotationDir"
  Write-Host 'GitHub production Android signing secrets: ROTATED'

  if ($GooglePlayResetConfirmed) {
    Write-Host 'Google Play upload-key reset: OPERATOR CONFIRMED'
  } else {
    Write-Warning 'Google Play upload-key reset is still REQUIRED. In Play Console, request an upload-key reset and provide the generated PEM certificate. Do not declare hard-public GO until Play accepts the replacement upload certificate.'
  }

  $branchAfterRotation = Invoke-GhApiJson -Endpoint "repos/$Repo/branches/$Branch" | ConvertFrom-Json
  if ([string]$branchAfterRotation.commit.sha -ne $targetSha) {
    throw "$Branch moved during remediation from $targetSha to $($branchAfterRotation.commit.sha). Re-audit the new exact SHA before release."
  }

  Write-Host 'External hard-launch remediation completed without moving main.'
} finally {
  Remove-Item Env:BIN_GROUP_ANDROID_STOREPASS -ErrorAction SilentlyContinue
  Remove-Item Env:BIN_GROUP_ANDROID_KEYPASS -ErrorAction SilentlyContinue
  $storePassword = $null
  $keyPassword = $null
  $keystoreBase64 = $null
}
