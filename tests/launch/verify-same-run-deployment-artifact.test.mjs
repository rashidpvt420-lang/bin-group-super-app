#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  AUTHORIZATION_KIND,
  DEPLOY_CONFIRMATION_PHRASE,
  HARD_LAUNCH_CONFIRMATION_PHRASE,
  HARD_LAUNCH_CONTROL_SCHEMA,
  sha256Text,
  signDocument,
} from '../../scripts/lib/hard-launch-control.mjs';
import { runSameRunDeploymentArtifactVerification } from '../../scripts/verify-same-run-deployment-artifact.mjs';

const SHA = 'a'.repeat(40);
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const REF = 'refs/heads/main';
const RUN_ID = '991122';
const RUN_ATTEMPT = 2;
const RELEASE_ID = `${RUN_ID}-${RUN_ATTEMPT}`;
const ACTOR = 'founder-actor';
const FOUNDER_EMAIL = 'founder@example.com';
const DIGEST = `sha256:${'ab'.repeat(32)}`;
const HMAC_KEY = 'test-only-hmac-key-that-is-more-than-32-characters';
const REQUIRED_COMPONENTS = [
  'hosting',
  'firestoreRules',
  'firestoreIndexes',
  'storageRules',
  'functions',
];

function writeJson(root, name, value) {
  const target = path.join(root, 'launch_package', name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(root, name) {
  return JSON.parse(readFileSync(path.join(root, 'launch_package', name), 'utf8'));
}

function mutate(root, name, update) {
  const doc = readJson(root, name);
  update(doc);
  writeJson(root, name, doc);
}

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'same-run-deployment-'));
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  writeJson(root, 'production-deployment.json', {
    status: 'passed',
    projectId: 'bin-group-57c60',
    mainUrl: 'https://bin-group-57c60.web.app',
    adminUrl: 'https://bin-group-admin-panel.web.app',
    deployedCommitSha: SHA,
    localCommitSha: SHA,
    deployedAt: nowIso,
    verifiedAt: nowIso,
    workflowRunId: RUN_ID,
    workflowRunAttempt: RUN_ATTEMPT,
    workflowRef: REF,
    repository: REPOSITORY,
    successfulComponents: REQUIRED_COMPONENTS,
    artifactDigest: DIGEST,
    validatedArtifactDigest: DIGEST,
    httpChecksOk: true,
    bundleVerified: true,
    hardLaunchClaim: false,
    source: 'firebase-production-deploy-workflow',
  });

  writeJson(root, 'production-incidents.json', {
    schemaVersion: 1,
    source: 'protected-workflow-dispatch-attestation',
    repository: REPOSITORY,
    commitSha: SHA,
    ref: REF,
    workflowRunId: RUN_ID,
    workflowRunAttempt: RUN_ATTEMPT,
    workflow: 'Firebase Production Deploy',
    actor: ACTOR,
    updatedAt: nowIso,
    updatedBy: ACTOR,
    attestation: 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR',
    evidenceReferences: ['ops://ticket/INC-REVIEW-1'],
    activeIncidents: [],
    requiresRollback: false,
    rollbackReason: null,
    lastDeploymentFailed: false,
    lastDeploymentFailedAt: null,
    lastSuccessfulDeployment: null,
    lastSuccessfulCommitSha: null,
    hardLaunchClaim: false,
  });

  writeJson(root, 'predeploy-approval.json', {
    schemaVersion: 1,
    commitSha: SHA,
    artifactDigest: DIGEST,
    releaseId: RELEASE_ID,
    approvedAt: nowIso,
    approvedBy: FOUNDER_EMAIL,
    approvedVia: 'github-environment-protection',
    githubEnvironment: 'production',
    launchMode: 'public',
  });

  const authorizationPayload = {
    schemaVersion: HARD_LAUNCH_CONTROL_SCHEMA,
    kind: AUTHORIZATION_KIND,
    approved: true,
    scope: 'production-deploy-and-conditional-hard-launch-decision',
    commitSha: SHA,
    ref: REF,
    repository: REPOSITORY,
    runId: RUN_ID,
    runAttempt: RUN_ATTEMPT,
    actor: ACTOR,
    founder: {
      name: 'Test Founder',
      email: FOUNDER_EMAIL,
    },
    issuedAt: nowIso,
    expiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
    deployConfirmationDigest: sha256Text(DEPLOY_CONFIRMATION_PHRASE),
    hardLaunchConfirmationDigest: sha256Text(HARD_LAUNCH_CONFIRMATION_PHRASE),
  };
  writeJson(
    root,
    'hard-launch-authorization.json',
    signDocument(authorizationPayload, HMAC_KEY),
  );

  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REF: REF,
    GITHUB_SHA: SHA,
    GITHUB_RUN_ID: RUN_ID,
    GITHUB_RUN_ATTEMPT: String(RUN_ATTEMPT),
    GITHUB_ACTOR: ACTOR,
    VALIDATED_ARTIFACT_DIGEST: DIGEST,
    RELEASE_ID,
    AUTHORIZED_FOUNDER_ACTORS: ACTOR,
    AUTHORIZED_FOUNDER_EMAILS: FOUNDER_EMAIL,
    HARD_LAUNCH_APPROVAL_HMAC_KEY: HMAC_KEY,
  };

  return { root, env, now };
}

function verify(fixture) {
  return runSameRunDeploymentArtifactVerification(fixture);
}

function withFixture(run) {
  const fixture = createFixture();
  try {
    return run(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function assertRejected(result, pattern) {
  assert.equal(result.ok, false);
  assert.equal(result.hardLaunchClaim, false);
  assert.match(result.failures.join('\n'), pattern);
}

describe('same-run production deployment artifact verifier', () => {
  it('accepts a complete artifact set bound to this protected workflow run', () => {
    withFixture((fixture) => {
      const result = verify(fixture);
      assert.equal(result.ok, true, result.failures.join('\n'));
      assert.equal(result.hardLaunchClaim, false);
      assert.equal(result.binding.artifactDigest, DIGEST);
    });
  });

  it('rejects each missing required document', () => {
    for (const name of [
      'production-deployment.json',
      'production-incidents.json',
      'predeploy-approval.json',
      'hard-launch-authorization.json',
    ]) {
      withFixture((fixture) => {
        unlinkSync(path.join(fixture.root, 'launch_package', name));
        assertRejected(verify(fixture), /Missing|missing/i);
      });
    }
  });

  it('rejects malformed JSON', () => {
    withFixture((fixture) => {
      writeFileSync(
        path.join(fixture.root, 'launch_package/production-deployment.json'),
        '{',
      );
      assertRejected(verify(fixture), /malformed JSON/i);
    });
  });

  it('rejects wrong deployment source', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => {
        doc.source = 'manual';
      });
      assertRejected(verify(fixture), /deployment source|production deploy workflow/i);
    });
  });

  it('rejects deployment status other than passed', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => {
        doc.status = 'pending';
      });
      assertRejected(verify(fixture), /status.*passed|deployment status/i);
    });
  });

  it('rejects hardLaunchClaim=true in deployment metadata', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => {
        doc.hardLaunchClaim = true;
      });
      assertRejected(verify(fixture), /hardLaunchClaim/i);
    });
  });

  it('requires deployment repository instead of validating it fail-open', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => {
        delete doc.repository;
      });
      assertRejected(verify(fixture), /deployment repository/i);
    });
  });

  it('requires deployment workflowRef=refs/heads/main', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => {
        delete doc.workflowRef;
      });
      assertRejected(verify(fixture), /workflowRef/i);
    });
  });

  it('rejects wrong deployment SHA and run ID', () => {
    for (const [field, value, pattern] of [
      ['deployedCommitSha', 'b'.repeat(40), /deployedCommitSha/i],
      ['workflowRunId', '123', /workflowRunId/i],
    ]) {
      withFixture((fixture) => {
        mutate(fixture.root, 'production-deployment.json', (doc) => {
          doc[field] = value;
        });
        assertRejected(verify(fixture), pattern);
      });
    }
  });

  it('requires the exact workflow run attempt', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => {
        delete doc.workflowRunAttempt;
      });
      assertRejected(verify(fixture), /workflowRunAttempt/i);
    });
  });

  it('rejects missing and mismatched deployment digests', () => {
    for (const [field, value] of [
      ['artifactDigest', undefined],
      ['artifactDigest', `sha256:${'cd'.repeat(32)}`],
      ['validatedArtifactDigest', undefined],
      ['validatedArtifactDigest', `sha256:${'cd'.repeat(32)}`],
    ]) {
      withFixture((fixture) => {
        mutate(fixture.root, 'production-deployment.json', (doc) => {
          if (value === undefined) delete doc[field];
          else doc[field] = value;
        });
        assertRejected(verify(fixture), /artifactDigest/i);
      });
    }
  });

  it('rejects stale or future deployment timestamps', () => {
    for (const [field, value, pattern] of [
      ['deployedAt', '2020-01-01T00:00:00.000Z', /stale/i],
      ['verifiedAt', new Date(Date.now() + 60 * 60 * 1000).toISOString(), /future/i],
    ]) {
      withFixture((fixture) => {
        mutate(fixture.root, 'production-deployment.json', (doc) => {
          doc[field] = value;
        });
        assertRejected(verify(fixture), pattern);
      });
    }
  });

  it('rejects missing required deployed components', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => {
        doc.successfulComponents = doc.successfulComponents.filter(
          (component) => component !== 'firestoreIndexes',
        );
      });
      assertRejected(verify(fixture), /firestoreIndexes/i);
    });
  });

  it('rejects static incidents and incident binding mismatches', () => {
    const cases = [
      ['source', undefined, /incidents source|static committed/i],
      ['repository', 'other/repository', /incidents repository/i],
      ['commitSha', 'b'.repeat(40), /incidents commitSha/i],
      ['ref', 'refs/heads/release', /incidents ref/i],
      ['workflowRunId', '123', /incidents workflowRunId/i],
      ['workflowRunAttempt', 3, /incidents workflowRunAttempt/i],
      ['actor', 'other-actor', /incidents actor/i],
      ['hardLaunchClaim', true, /incidents hardLaunchClaim/i],
    ];
    for (const [field, value, pattern] of cases) {
      withFixture((fixture) => {
        mutate(fixture.root, 'production-incidents.json', (doc) => {
          if (value === undefined) delete doc[field];
          else doc[field] = value;
        });
        assertRejected(verify(fixture), pattern);
      });
    }
  });

  it('rejects blocking P0/P1 incidents and rollback holds', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'production-incidents.json', (doc) => {
        doc.attestation = 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS';
        doc.activeIncidents = [{ id: 'P0-1', severity: 'P0', status: 'open' }];
      });
      assertRejected(verify(fixture), /P0\/P1|active production incidents/i);
    });
    withFixture((fixture) => {
      mutate(fixture.root, 'production-incidents.json', (doc) => {
        doc.attestation = 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS';
        doc.requiresRollback = true;
        doc.rollbackReason = 'rollback now';
      });
      assertRejected(verify(fixture), /Rollback hold|rollback is required/i);
    });
  });

  it('rejects a cooling-period violation after a failed deployment', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'production-incidents.json', (doc) => {
        doc.attestation = 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS';
        doc.lastDeploymentFailed = true;
        doc.lastDeploymentFailedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      });
      assertRejected(verify(fixture), /30-minute|wait ≥30/i);
    });
  });

  it('rejects predeploy approval SHA, digest, and release binding mismatches', () => {
    for (const [field, value, pattern] of [
      ['commitSha', 'b'.repeat(40), /approval commitSha/i],
      ['artifactDigest', `sha256:${'cd'.repeat(32)}`, /approval artifactDigest/i],
      ['releaseId', `${RUN_ID}-1`, /approval releaseId/i],
    ]) {
      withFixture((fixture) => {
        mutate(fixture.root, 'predeploy-approval.json', (doc) => {
          doc[field] = value;
        });
        assertRejected(verify(fixture), pattern);
      });
    }
  });

  it('requires the predeploy approver to be authorized', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'predeploy-approval.json', (doc) => {
        doc.approvedBy = 'unauthorized@example.com';
      });
      assertRejected(verify(fixture), /approvedBy.*AUTHORIZED_FOUNDER_EMAILS/i);
    });
  });

  it('rejects authorization SHA, repository, ref, run, attempt, and HMAC mismatches', () => {
    const cases = [
      ['commitSha', 'b'.repeat(40), /authorization commitSha/i],
      ['repository', 'other/repository', /authorization repository/i],
      ['ref', 'refs/heads/release', /authorization ref/i],
      ['runId', '123', /authorization workflow run/i],
      ['runAttempt', 3, /authorization workflow run attempt/i],
    ];
    for (const [field, value, pattern] of cases) {
      withFixture((fixture) => {
        mutate(fixture.root, 'hard-launch-authorization.json', (doc) => {
          doc[field] = value;
        });
        assertRejected(verify(fixture), pattern);
      });
    }
    withFixture((fixture) => {
      const env = {
        ...fixture.env,
        HARD_LAUNCH_APPROVAL_HMAC_KEY:
          'different-test-hmac-key-that-is-more-than-32-characters',
      };
      assertRejected(verify({ ...fixture, env }), /signature verification failed/i);
    });
  });

  it('requires protected GitHub Actions context and exact repository/ref', () => {
    for (const [key, value, pattern] of [
      ['GITHUB_ACTIONS', 'false', /GITHUB_ACTIONS/i],
      ['GITHUB_REPOSITORY', 'other/repository', /GITHUB_REPOSITORY/i],
      ['GITHUB_REF', 'refs/heads/release', /GITHUB_REF/i],
      ['GITHUB_RUN_ATTEMPT', '', /GITHUB_RUN_ATTEMPT/i],
      ['VALIDATED_ARTIFACT_DIGEST', '', /VALIDATED_ARTIFACT_DIGEST/i],
    ]) {
      withFixture((fixture) => {
        const env = { ...fixture.env, [key]: value };
        assertRejected(verify({ ...fixture, env }), pattern);
      });
    }
  });
});
