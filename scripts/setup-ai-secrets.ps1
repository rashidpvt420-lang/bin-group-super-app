param(
  [string]$ProjectId = "bin-group-57c60"
)

$ErrorActionPreference = "Stop"

Write-Host "BIN GROUP AI secret setup" -ForegroundColor Yellow
Write-Host "Project: $ProjectId" -ForegroundColor Yellow
Write-Host "This script uses Firebase Functions secrets. Values are entered into the Firebase CLI prompt, not committed to Git." -ForegroundColor Gray
Write-Host ""

function Assert-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not installed or not available in PATH."
  }
}

Assert-Command "firebase"
Assert-Command "node"
Assert-Command "npm"

firebase use $ProjectId

Write-Host ""
Write-Host "Set OPENAI_API_KEY. Paste the key only when Firebase asks for the secret value." -ForegroundColor Cyan
firebase functions:secrets:set OPENAI_API_KEY --project $ProjectId

Write-Host ""
Write-Host "Set IMAGE_GENERATION_API_KEY. You may paste the same OpenAI key if you want Design Studio image generation to use OpenAI." -ForegroundColor Cyan
firebase functions:secrets:set IMAGE_GENERATION_API_KEY --project $ProjectId

Write-Host ""
Write-Host "Set GEMINI_API_KEY. Use your Google AI Studio Gemini key." -ForegroundColor Cyan
firebase functions:secrets:set GEMINI_API_KEY --project $ProjectId

Write-Host ""
Write-Host "Secret metadata check. This does not print secret values." -ForegroundColor Yellow
firebase functions:secrets:get OPENAI_API_KEY --project $ProjectId
firebase functions:secrets:get IMAGE_GENERATION_API_KEY --project $ProjectId
firebase functions:secrets:get GEMINI_API_KEY --project $ProjectId

Write-Host ""
Write-Host "Building Functions..." -ForegroundColor Yellow
Push-Location functions
npm install
npm run build
Pop-Location

Write-Host ""
Write-Host "Deploying AI Functions. Use the full gated deploy workflow if your repo blocks direct production deploys." -ForegroundColor Yellow
firebase deploy --only functions:runSovereignAI,functions:generateDesignConcept,functions:generateAIDesignConceptImages --project $ProjectId

Write-Host ""
Write-Host "AI secret setup completed. Next: redeploy Admin Hosting so the latest AI Design Studio and chat UI are live." -ForegroundColor Green
