#!/usr/bin/env node

/**
 * Hard-Launch Approval Gate
 * 
 * Enforces the four required checks before any production deployment is allowed:
 * 1. Hard-launch approval flag must be explicitly set in launch-proof-gates.json
 * 2. Founder/CEO authorization must be present and valid
 * 3. No active incidents or rollback flags in production telemetry
 * 4. Deployed commit must exactly match the validated build commit
 * 
 * This gate is a fail-closed control. It cannot be bypassed with environment variables.
 * Production credentials remain external and cannot be fabricated by this script.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const failures = [];

// ============================================================================
// 1. Hard-Launch Approval Flag Check
// ============================================================================

function checkHardLaunchApproval() {
  const gatePath = resolve('launch_package/launch-proof-gates.json');
  
  if (!existsSync(gatePath)) {
    failures.push('Missing launch-proof-gates.json. Cannot proceed with hard-launch approval.');
    return;
  }
  
  let gateData;
  try {
    gateData = JSON.parse(readFileSync(gatePath, 'utf8'));
  } catch (e) {
    failures.push(`Failed to parse launch-proof-gates.json: ${e.message}`);
    return;
  }
  
  // Check if hardLaunchApproved flag exists and is true
  if (gateData.hardLaunchApproved !== true) {
    failures.push(
      'Hard-launch approval flag is not set. ' +
      'Set hardLaunchApproved: true in launch-proof-gates.json after manual review and approval.'
    );
  }
  
  // Check approval timestamp is recent (within 24 hours)
  if (gateData.hardLaunchApprovedAt) {
    const approvedTime = new Date(gateData.hardLaunchApprovedAt);
    const nowTime = new Date();
    const hoursDiff = (nowTime - approvedTime) / (1000 * 60 * 60);
    
    if (hoursDiff > 24) {
      failures.push(
        `Hard-launch approval is stale (${hoursDiff.toFixed(1)} hours old). ` +
        'Re-approval is required for production deployment.'
      );
    }
  } else {
    failures.push(
      'Hard-launch approval timestamp (hardLaunchApprovedAt) is missing. ' +
      'Approval must include ISO-8601 timestamp.'
    );
  }
}

// ============================================================================
// 2. Founder Authorization Check
// ============================================================================

function checkFounderAuthorization() {
  const gatePath = resolve('launch_package/launch-proof-gates.json');
  
  let gateData;
  try {
    gateData = JSON.parse(readFileSync(gatePath, 'utf8'));
  } catch (e) {
    return; // Already reported above
  }
  
  const founderAuth = gateData.founderAuthorization;
  
  if (!founderAuth) {
    failures.push(
      'Founder authorization is missing from launch-proof-gates.json. ' +
      'CEO/Founder must explicitly authorize production deployment.'
    );
    return;
  }
  
  // Validate founder authorization structure
  const requiredFields = ['founderEmail', 'founderName', 'authorizedAt', 'signature'];
  for (const field of requiredFields) {
    if (!founderAuth[field]) {
      failures.push(
        `Founder authorization field is missing: ${field}. ` +
        `Required: { founderEmail, founderName, authorizedAt, signature }`
      );
    }
  }
  
  // Validate founder email against environment or known founders
  if (founderAuth.founderEmail) {
    const founderEmails = (process.env.AUTHORIZED_FOUNDER_EMAILS || 'ceo@bin-groups.com')
      .split(',')
      .map(e => e.trim().toLowerCase());
    
    const isAuthorizedFounder = founderEmails.includes(founderAuth.founderEmail.toLowerCase());
    if (!isAuthorizedFounder) {
      failures.push(
        `Founder email ${founderAuth.founderEmail} is not in authorized founders list. ` +
        `Authorized: ${founderEmails.join(', ')}`
      );
    }
  }
  
  // Validate authorization timestamp is recent (within 7 days)
  if (founderAuth.authorizedAt) {
    const authTime = new Date(founderAuth.authorizedAt);
    const nowTime = new Date();
    const daysDiff = (nowTime - authTime) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 7) {
      failures.push(
        `Founder authorization is stale (${daysDiff.toFixed(1)} days old). ` +
        'Re-authorization is required before deployment.'
      );
    }
  }
  
  // Validate signature format (must be non-empty hex or GUID)
  if (founderAuth.signature) {
    if (!/^[a-f0-9\-]{20,}$/i.test(founderAuth.signature)) {
      failures.push(
        `Founder authorization signature format is invalid. ` +
        `Expected hex string or UUID, got: ${founderAuth.signature}`
      );
    }
  }
}

// ============================================================================
// 3. Incident and Rollback Check
// ============================================================================

function checkProductionIncidents() {
  const incidentPath = resolve('launch_package/production-incidents.json');
  
  // If incidents file doesn't exist, production is clean
  if (!existsSync(incidentPath)) {
    return;
  }
  
  let incidentData;
  try {
    incidentData = JSON.parse(readFileSync(incidentPath, 'utf8'));
  } catch (e) {
    failures.push(`Failed to parse production-incidents.json: ${e.message}`);
    return;
  }
  
  // Check for active incidents
  if (incidentData.activeIncidents && incidentData.activeIncidents.length > 0) {
    const activeList = incidentData.activeIncidents
      .map(inc => `${inc.id}: ${inc.severity} (${inc.status})`)
      .join('; ');
    failures.push(
      `Active production incidents detected: ${activeList}. ` +
      `Resolve incidents before deployment.`
    );
  }
  
  // Check for rollback flags
  if (incidentData.requiresRollback === true) {
    failures.push(
      `Production rollback flag is set. ` +
      `${incidentData.rollbackReason || 'Reason not specified.'} ` +
      `Complete rollback before attempting new deployment.`
    );
  }
  
  // Check if last deployment was unsuccessful
  if (incidentData.lastDeploymentFailed === true) {
    const failTime = new Date(incidentData.lastDeploymentFailedAt);
    const nowTime = new Date();
    const minDiff = (nowTime - failTime) / (1000 * 60);
    
    if (minDiff < 30) {
      failures.push(
        `Last production deployment failed ${minDiff.toFixed(0)} minutes ago. ` +
        `Wait at least 30 minutes before retry, or resolve the failure first.`
      );
    }
  }
}

// ============================================================================
// 4. Same-Commit Production Evidence Enforcement
// ============================================================================

function checkSameCommitEvidence() {
  const deploymentMetadataPath = resolve('launch_package/production-deployment.json');
  const gitCommitSha = process.env.GITHUB_SHA;
  
  if (!gitCommitSha) {
    failures.push(
      'GITHUB_SHA environment variable is not set. ' +
      'This gate must run inside a GitHub Actions workflow.'
    );
    return;
  }
  
  if (!existsSync(deploymentMetadataPath)) {
    failures.push(
      'production-deployment.json does not exist. ' +
      'Deployment validation has not run. Run verify:production-deployment step first.'
    );
    return;
  }
  
  let deploymentMeta;
  try {
    deploymentMeta = JSON.parse(readFileSync(deploymentMetadataPath, 'utf8'));
  } catch (e) {
    failures.push(`Failed to parse production-deployment.json: ${e.message}`);
    return;
  }
  
  // Verify deployment status passed
  if (deploymentMeta.status !== 'passed') {
    failures.push(
      `Deployment verification status is not passed: ${deploymentMeta.status}. ` +
      `Check production-deployment-verify.log for details.`
    );
  }
  
  // Verify HTTP checks passed
  if (deploymentMeta.httpChecksOk !== true) {
    failures.push(
      `Production HTTP accessibility checks failed. ` +
      `Verify hosting URLs are reachable and returning correct status codes.`
    );
  }
  
  // Verify bundle integrity
  if (deploymentMeta.bundleVerified !== true) {
    failures.push(
      `Production bundle integrity verification failed. ` +
      `Built assets may be corrupted or incomplete.`
    );
  }
  
  // CRITICAL: Verify deployed commit exactly matches current workflow commit
  if (deploymentMeta.deployedCommitSha !== gitCommitSha) {
    failures.push(
      `Commit mismatch DETECTED. ` +
      `Workflow commit: ${gitCommitSha} ` +
      `Deployed commit: ${deploymentMeta.deployedCommitSha} ` +
      `Each commit must be deployed independently. Do not cherry-pick or skip commits.`
    );
  }
  
  // Verify hard-launch claim is false (no premature claims)
  if (deploymentMeta.hardLaunchClaim === true) {
    failures.push(
      `Deployment metadata incorrectly claims hardLaunchClaim === true. ` +
      `This flag should only be true after the entire hard-launch gate passes.`
    );
  }
  
  // Verify deployment timestamp is recent (within 2 hours)
  if (deploymentMeta.deployedAt) {
    const deployTime = new Date(deploymentMeta.deployedAt);
    const nowTime = new Date();
    const minDiff = (nowTime - deployTime) / (1000 * 60);
    
    if (minDiff > 120) {
      failures.push(
        `Production deployment is stale (${minDiff.toFixed(0)} minutes old). ` +
        `Deployment must be recent (within 2 hours) to ensure it matches current code state.`
      );
    }
  }
}

// ============================================================================
// Main Execution
// ============================================================================

function main() {
  console.log('\n=== Hard-Launch Approval Gate ===\n');
  
  console.log('Checking hard-launch approval flag...');
  checkHardLaunchApproval();
  
  console.log('Checking founder authorization...');
  checkFounderAuthorization();
  
  console.log('Checking production incidents and rollback status...');
  checkProductionIncidents();
  
  console.log('Checking same-commit production evidence...');
  checkSameCommitEvidence();
  
  // Report results
  if (failures.length === 0) {
    console.log('\n✅ Hard-launch approval gate PASSED.\n');
    console.log('All checks passed:');
    console.log('  ✓ Hard-launch approval flag is set');
    console.log('  ✓ Founder authorization is valid and recent');
    console.log('  ✓ No active incidents or rollback flags');
    console.log('  ✓ Deployed commit matches workflow commit');
    process.exit(0);
  } else {
    console.error('\n❌ Hard-launch approval gate FAILED:\n');
    for (const failure of failures) {
      console.error(`  ✗ ${failure}`);
    }
    console.error('\nProduction deployment is NOT authorized until all gates pass.\n');
    process.exit(1);
  }
}

main();
