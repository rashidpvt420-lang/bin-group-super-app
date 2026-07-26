from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


path = Path('functions/technicianLiveLocation.ts')
source = path.read_text(encoding='utf-8')
source = replace_once(
    source,
    """        if (!ticketSnap.exists) throw new HttpsError("not-found", "Assigned mission not found.");
        if (assignedTechnicianId(ticket) !== technicianUid) {
          throw new HttpsError("permission-denied", "You are not assigned to this mission.");
        }

        tx.set(liveRef, {
""",
    """        // The canonical live document is keyed by the authenticated Technician
        // and the exact ticket/session CAS has already passed. A deleted ticket
        // must not strand that canonical session forever. Assignment is checked
        // whenever the ticket still exists; missing ticket mirrors are skipped.
        if (ticketSnap.exists && assignedTechnicianId(ticket) !== technicianUid) {
          throw new HttpsError("permission-denied", "You are not assigned to this mission.");
        }

        tx.set(liveRef, {
""",
    'missing-ticket STOP authority',
)
source = replace_once(
    source,
    """        tx.set(ticketRef, {
          trackingStatus: "STOPPED",
          technicianLocationExpiresAt: now,
          updatedAt: now,
        }, { merge: true });
""",
    """        if (ticketSnap.exists) {
          tx.set(ticketRef, {
            trackingStatus: "STOPPED",
            technicianLocationExpiresAt: now,
            updatedAt: now,
          }, { merge: true });
        }
""",
    'missing ticket mirror skip',
)
path.write_text(source, encoding='utf-8')

test_path = Path('tests/launch/technician-live-location-cas.test.mjs')
test_source = test_path.read_text(encoding='utf-8')
test_source += """

test('exact canonical STOP can reconcile when its ticket document is missing', () => {
  assert.match(callableSource, /if \(ticketSnap\.exists && assignedTechnicianId\(ticket\) !== technicianUid\)/);
  assert.match(callableSource, /if \(ticketSnap\.exists\) \{\s*tx\.set\(ticketRef/);
  const stopBranch = callableSource.slice(callableSource.indexOf('if (action === "STOP")'), callableSource.indexOf('if (!ticketSnap.exists)', callableSource.indexOf('if (action === "STOP")'));
  assert.doesNotMatch(stopBranch, /Assigned mission not found/);
});
"""
test_path.write_text(test_source, encoding='utf-8')
