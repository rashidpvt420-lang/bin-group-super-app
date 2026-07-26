from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


server_path = Path('functions/technicianLiveLocation.ts')
server = server_path.read_text(encoding='utf-8')
server = replace_once(
    server,
    """        if (stopDecision === "REJECT_MISSING") {
          throw new HttpsError("failed-precondition", "No canonical live tracking session exists for this STOP request.");
        }
""",
    """        if (stopDecision === "REJECT_MISSING") {
          tx.set(auditRef, {
            actorId: technicianUid,
            actorRole: "technician",
            action: "TECHNICIAN_LIVE_LOCATION_STOP_SKIPPED",
            targetType: "technician_live_locations",
            targetId: technicianUid,
            requestedTicketId: ticketId,
            requestedTrackingSessionId: trackingSessionId,
            currentTicketId: null,
            currentTrackingSessionId: null,
            reason: "REJECT_MISSING",
            createdAt: now,
          });
          return {
            action,
            sequence: previousSequence,
            expiresAtMs: now.toMillis(),
            alreadyStopped: true,
            superseded: false,
            missingSession: true,
          };
        }
""",
    'missing canonical STOP server no-op',
)
server_path.write_text(server, encoding='utf-8')


client_path = Path('src/utils/liveTracking.ts')
client = client_path.read_text(encoding='utf-8')
client = replace_once(
    client,
    """type LiveTrackingActionResult = {
    superseded: boolean;
    alreadyStopped: boolean;
};
""",
    """type LiveTrackingActionResult = {
    superseded: boolean;
    alreadyStopped: boolean;
    missingSession: boolean;
};
""",
    'client action result type',
)
client = replace_once(
    client,
    """    return {
        superseded: data.superseded === true,
        alreadyStopped: data.alreadyStopped === true,
    };
""",
    """    return {
        superseded: data.superseded === true,
        alreadyStopped: data.alreadyStopped === true,
        missingSession: data.missingSession === true,
    };
""",
    'client action result parsing',
)
client = replace_once(
    client,
    """export type StopLiveTrackingResult = {
    hadActiveSession: boolean;
    serverAcknowledged: boolean;
    superseded: boolean;
    stopQueued: boolean;
};
""",
    """export type StopLiveTrackingResult = {
    hadActiveSession: boolean;
    serverAcknowledged: boolean;
    superseded: boolean;
    missingSession: boolean;
    stopQueued: boolean;
};
""",
    'STOP result missing-session truth',
)
client = replace_once(
    client,
    """    let stopAcknowledged = false;
    let stopSuperseded = false;
    let stopQueued = false;
""",
    """    let stopAcknowledged = false;
    let stopSuperseded = false;
    let stopMissingSession = false;
    let stopQueued = false;
""",
    'STOP state missing-session flag',
)
client = replace_once(
    client,
    """            const response = await sendAction(stopAction);
            stopSuperseded = response.superseded;
            stopAcknowledged = !stopSuperseded;
""",
    """            const response = await sendAction(stopAction);
            stopSuperseded = response.superseded;
            stopMissingSession = response.missingSession;
            stopAcknowledged = !stopSuperseded;
""",
    'STOP response missing-session flag',
)
client = replace_once(
    client,
    """        const diagnostic = stopSuperseded ? {
            status: 'STOP_SUPERSEDED_RECONCILED',
            finalStatus,
            trackingSessionId: sessionId,
            reconciledAt: serverTimestamp(),
            serverAcknowledged: true,
            canonicalSessionUnchanged: true,
        } : stopAcknowledged ? {
""",
    """        const diagnostic = stopSuperseded ? {
            status: 'STOP_SUPERSEDED_RECONCILED',
            finalStatus,
            trackingSessionId: sessionId,
            reconciledAt: serverTimestamp(),
            serverAcknowledged: true,
            canonicalSessionUnchanged: true,
        } : stopMissingSession ? {
            status: 'STOP_MISSING_SESSION_RECONCILED',
            finalStatus,
            trackingSessionId: sessionId,
            reconciledAt: serverTimestamp(),
            serverAcknowledged: true,
            canonicalSessionAbsent: true,
        } : stopAcknowledged ? {
""",
    'missing-session diagnostic truth',
)
client = replace_once(
    client,
    """        superseded: stopSuperseded,
        stopQueued,
""",
    """        superseded: stopSuperseded,
        missingSession: stopMissingSession,
        stopQueued,
""",
    'STOP result missing-session response',
)
client_path.write_text(client, encoding='utf-8')


test_path = Path('tests/launch/technician-live-location-cas.test.mjs')
test_source = test_path.read_text(encoding='utf-8')
test_source += """

test('missing canonical STOP is an audited acknowledged no-op instead of a terminal client lock', () => {
  const branchStart = callableSource.indexOf('if (stopDecision === "REJECT_MISSING")');
  const branchEnd = callableSource.indexOf('if (stopDecision === "REJECT_SUPERSEDED")', branchStart);
  const branch = callableSource.slice(branchStart, branchEnd);
  assert.match(branch, /TECHNICIAN_LIVE_LOCATION_STOP_SKIPPED/);
  assert.match(branch, /reason: "REJECT_MISSING"/);
  assert.match(branch, /missingSession: true/);
  assert.match(branch, /alreadyStopped: true/);
  assert.doesNotMatch(branch, /tx\.set\(liveRef/);
  assert.doesNotMatch(branch, /throw new HttpsError/);

  assert.match(clientSource, /missingSession: data\.missingSession === true/);
  assert.match(clientSource, /stopMissingSession = response\.missingSession/);
  assert.match(clientSource, /STOP_MISSING_SESSION_RECONCILED/);
  assert.match(clientSource, /canonicalSessionAbsent: true/);
});
"""
test_path.write_text(test_source, encoding='utf-8')


contract_path = Path('tests/launch/gps-missing-session-stop-contract.test.mjs')
contract_path.write_text("""import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('STOP before first canonical UPDATE is recoverable and truthfully diagnosed', async () => {
  const [server, client] = await Promise.all([
    read('functions/technicianLiveLocation.ts'),
    read('src/utils/liveTracking.ts'),
  ]);
  const missingStart = server.indexOf('if (stopDecision === "REJECT_MISSING")');
  const supersededStart = server.indexOf('if (stopDecision === "REJECT_SUPERSEDED")', missingStart);
  const missingBranch = server.slice(missingStart, supersededStart);
  assert.ok(missingStart >= 0 && supersededStart > missingStart);
  assert.match(missingBranch, /missingSession: true/);
  assert.match(missingBranch, /currentTrackingSessionId: null/);
  assert.doesNotMatch(missingBranch, /throw new HttpsError/);
  assert.doesNotMatch(missingBranch, /tx\.set\(liveRef/);

  assert.match(client, /STOP_MISSING_SESSION_RECONCILED/);
  assert.match(client, /canonicalSessionAbsent: true/);
  assert.match(client, /serverAcknowledged: stopAcknowledged \|\| stopSuperseded/);
});
""", encoding='utf-8')
