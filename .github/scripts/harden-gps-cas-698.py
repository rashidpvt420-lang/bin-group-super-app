from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count was {count}, expected 1')
    return source.replace(old, new, 1)


server_path = Path('functions/technicianLiveLocation.ts')
server = server_path.read_text(encoding='utf-8')
server = replace_once(
    server,
    '''        if (stopDecision === "REJECT_SUPERSEDED") {
          throw new HttpsError(
            "failed-precondition",
            "This STOP request belongs to an older or different tracking session and cannot change the current session.",
          );
        }
''',
    '''        if (stopDecision === "REJECT_SUPERSEDED") {
          const previousExpiryMs = previous.expiresAt?.toMillis?.();
          tx.set(auditRef, {
            actorId: technicianUid,
            actorRole: "technician",
            action: "TECHNICIAN_LIVE_LOCATION_STOP_SKIPPED",
            targetType: "technician_live_locations",
            targetId: technicianUid,
            requestedTicketId: ticketId,
            requestedTrackingSessionId: trackingSessionId,
            currentTicketId: String(previous.activeTicketId || "") || null,
            currentTrackingSessionId: String(previous.trackingSessionId || "") || null,
            reason: "REJECT_SUPERSEDED",
            createdAt: now,
          });
          return {
            action,
            sequence: previousSequence,
            expiresAtMs: Number.isFinite(previousExpiryMs) ? previousExpiryMs : now.toMillis(),
            alreadyStopped: false,
            superseded: true,
          };
        }
''',
    'superseded STOP acknowledgement',
)
server = replace_once(
    server,
    '''        const ticketId = currentState.activeTicketId;
        const trackingSessionId = currentState.trackingSessionId || null;
        const technicianRef = db.collection("technicians").doc(technicianUid);
''',
    '''        const ticketId = currentState.activeTicketId;
        const trackingSessionId = currentState.trackingSessionId || null;
        const ticketRef = ticketId ? db.collection("maintenanceTickets").doc(ticketId) : null;
        const ticketSnap = ticketRef ? await tx.get(ticketRef) : null;
        const technicianRef = db.collection("technicians").doc(technicianUid);
''',
    'watchdog ticket existence read',
)
server = replace_once(
    server,
    '''        if (ticketId) {
          tx.set(db.collection("maintenanceTickets").doc(ticketId), {
            trackingStatus: "STOPPED_STALE",
            technicianLocationExpiresAt: transactionNow,
            trackingReconciledAt: transactionNow,
            updatedAt: transactionNow,
          }, { merge: true });
        }
''',
    '''        if (ticketRef && ticketSnap?.exists) {
          tx.set(ticketRef, {
            trackingStatus: "STOPPED_STALE",
            technicianLocationExpiresAt: transactionNow,
            trackingReconciledAt: transactionNow,
            updatedAt: transactionNow,
          }, { merge: true });
        }
''',
    'watchdog conditional ticket mirror',
)
server = replace_once(
    server,
    '''          action: "TECHNICIAN_LIVE_LOCATION_EXPIRED",
          targetType: "maintenanceTickets",
          targetId: ticketId || snapshot.id,
          technicianUid,
''',
    '''          action: "TECHNICIAN_LIVE_LOCATION_EXPIRED",
          targetType: ticketSnap?.exists ? "maintenanceTickets" : "technician_live_locations",
          targetId: ticketSnap?.exists ? ticketId : snapshot.id,
          requestedTicketId: ticketId || null,
          ticketMissing: Boolean(ticketId) && ticketSnap?.exists !== true,
          technicianUid,
''',
    'watchdog missing-ticket audit truth',
)
server_path.write_text(server, encoding='utf-8')


test_path = Path('tests/launch/technician-live-location-cas.test.mjs')
tests = test_path.read_text(encoding='utf-8')
tests = replace_once(
    tests,
    '''  assert.match(callableSource, /alreadyStopped: true/);
''',
    '''  assert.match(callableSource, /alreadyStopped: true/);
  assert.match(callableSource, /TECHNICIAN_LIVE_LOCATION_STOP_SKIPPED/);
  assert.match(callableSource, /superseded: true/);
''',
    'superseded STOP source assertions',
)
tests = replace_once(
    tests,
    '''  assert.match(callableSource, /Another unexpired tracking session is active; stale or cross-tab coordinates were rejected/);
''',
    '''  assert.match(callableSource, /Another unexpired tracking session is active; stale or cross-tab coordinates were rejected/);
  assert.match(callableSource, /const ticketSnap = ticketRef \? await tx\.get\(ticketRef\) : null/);
  assert.match(callableSource, /if \(ticketRef && ticketSnap\?\.exists\)/);
  assert.match(callableSource, /ticketMissing: Boolean\(ticketId\) && ticketSnap\?\.exists !== true/);
  assert.doesNotMatch(callableSource, /if \(ticketId\) \{\s*tx\.set\(db\.collection\("maintenanceTickets"\)\.doc\(ticketId\)/);
''',
    'watchdog missing-ticket source assertions',
)
test_path.write_text(tests, encoding='utf-8')
