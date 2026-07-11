# Phase G — scoped Cloud Functions deploy (bank pilot; no Stripe operational claims)
# Run from repo root after: npm run build:functions
# Requires: firebase login + deploy permissions on bin-group-57c60
#
# Prefer this scoped deploy for bank-transfer pilot (SMTP mail queue, ticket lifecycle,
# owner onboarding flows). A full `firebase deploy --only functions` is also valid if
# you already deployed everything — scoped deploy is faster and lower blast radius.
#
# Bank pilot does NOT require Stripe checkout functions. Do not enable
# VITE_ENABLE_STRIPE_CHECKOUT until sk_live_ + whsec_ are verified.

$ErrorActionPreference = 'Stop'

Write-Host 'Building functions...'
npm run build:functions

$exports = @(
  'sendQueuedMailOnCreate',          # SMTP live delivery (Gate 12)
  'adminRetryMailDelivery',
  'updateTicketLifecycleV2',         # ticket lifecycle v2
  'approveOwnerSubmissionOperationalFlow',
  'submitOwnerOnboardingPaymentPackage',
  'uploadOwnerOnboardingProofDocument'
) -join ','

$only = "functions:$($exports -replace ',', ',functions:')"
Write-Host "Scoped deploy: $only"
firebase deploy --only $only --project bin-group-57c60

Write-Host ''
Write-Host 'Post-deploy verification:'
Write-Host '  npm run test:gate12:smtp'
Write-Host '  npm run test:gate12:appcheck:enforce'
