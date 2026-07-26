from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


callable_path = Path('functions/technicianLiveLocation.ts')
source = callable_path.read_text(encoding='utf-8')
source = replace_once(
    source,
    """        if (stopDecision === "REJECT_SUPERSEDED") {
          throw new HttpsError(
            "failed-precondition",
            "This STOP request belongs to an older or different tracking session and cannot change the current session.",
          );
        }
""",
    """        if (stopDecision === "REJECT_SUPERSEDED") {
          // The canonical session is newer or belongs to another ticket. Preserve
          // it unchanged, but acknowledge the stale STOP so an offline client can
          // remove its queue entry instead of becoming permanently blocked.
          tx.set(auditRef, {
            actorId: technicianUid,
            actorRole: "technician",
            action: "TECHNICIAN_LIVE_LOCATION_STALE_STOP_IGNORED",
            targetType: "technician_live_locations",
            targetId: technicianUid,
            requestedTicketId: ticketId,
            requestedTrackingSessionId: trackingSessionId,
            canonicalTicketId: String(previous.activeTicketId || "") || null,
            canonicalTrackingSessionId: String(previous.trackingSessionId || "") || null,
            createdAt: now,
          });
          const previousExpiryMs = previous.expiresAt?.toMillis?.();
          return {
            action,
            sequence: previousSequence,
            expiresAtMs: Number.isFinite(previousExpiryMs) ? previousExpiryMs : now.toMillis(),
            alreadyStopped: false,
            staleIgnored: true,
          };
        }
""",
    'superseded STOP acknowledgement',
)
callable_path.write_text(source, encoding='utf-8')

test_path = Path('tests/launch/technician-live-location-cas.test.mjs')
test_source = test_path.read_text(encoding='utf-8')
test_source = replace_once(
    test_source,
    """  assert.match(callableSource, /alreadyStopped: true/);
  assert.doesNotMatch(callableSource, /const batch = db\.batch\(\)/);
""",
    """  assert.match(callableSource, /alreadyStopped: true/);
  assert.match(callableSource, /TECHNICIAN_LIVE_LOCATION_STALE_STOP_IGNORED/);
  assert.match(callableSource, /staleIgnored: true/);
  assert.match(callableSource, /canonicalTrackingSessionId/);
  assert.doesNotMatch(callableSource, /stopDecision === \"REJECT_SUPERSEDED\"[\s\S]{0,220}throw new HttpsError/);
  assert.doesNotMatch(callableSource, /const batch = db\.batch\(\)/);
""",
    'stale STOP source contract',
)
test_source += """

test('superseded STOP is an audited acknowledged no-op so client reconciliation can finish', () => {
  const branchStart = callableSource.indexOf('if (stopDecision === "REJECT_SUPERSEDED")');
  const branchEnd = callableSource.indexOf('if (stopDecision === "ALREADY_STOPPED")', branchStart);
  const branch = callableSource.slice(branchStart, branchEnd);
  assert.match(branch, /TECHNICIAN_LIVE_LOCATION_STALE_STOP_IGNORED/);
  assert.match(branch, /staleIgnored: true/);
  assert.match(branch, /canonicalTicketId/);
  assert.match(branch, /canonicalTrackingSessionId/);
  assert.doesNotMatch(branch, /tx\.set\(liveRef/);
  assert.doesNotMatch(branch, /throw new HttpsError/);
});
"""
test_path.write_text(test_source, encoding='utf-8')
