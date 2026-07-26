from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


tracking_path = Path('src/utils/liveTracking.ts')
tracking = tracking_path.read_text(encoding='utf-8')
tracking = replace_once(
    tracking,
    """export const stopLiveTracking = async (
    technicianUid?: string,
    ticketId?: string,
    finalStatus: StopTrackingStatus = 'PRESERVE',
): Promise<void> => {
""",
    """export type StopLiveTrackingResult = {
    hadActiveSession: boolean;
    serverAcknowledged: boolean;
    superseded: boolean;
    stopQueued: boolean;
};

export const stopLiveTracking = async (
    technicianUid?: string,
    ticketId?: string,
    finalStatus: StopTrackingStatus = 'PRESERVE',
): Promise<StopLiveTrackingResult> => {
""",
    'stop result contract',
)
tracking = replace_once(
    tracking,
    """    let stopAcknowledged = false;
    let stopSuperseded = false;
    if (uid && activeTicketId && sessionId) {
""",
    """    const hadActiveSession = Boolean(uid && activeTicketId && sessionId);
    let stopAcknowledged = false;
    let stopSuperseded = false;
    let stopQueued = false;
    if (uid && activeTicketId && sessionId) {
""",
    'stop state flags',
)
tracking = replace_once(
    tracking,
    """        } catch (error) {
            enqueueGpsRetryAction({
                action: 'STOP',
""",
    """        } catch (error) {
            stopQueued = true;
            enqueueGpsRetryAction({
                action: 'STOP',
""",
    'stop queue truth',
)
tracking = replace_once(
    tracking,
    """    if (stopAcknowledged || stopSuperseded || !uid) detachOnlineRecovery();
};
""",
    """    if (stopAcknowledged || stopSuperseded || !uid) detachOnlineRecovery();
    return {
        hadActiveSession,
        serverAcknowledged: stopAcknowledged || stopSuperseded,
        superseded: stopSuperseded,
        stopQueued,
    };
};

export const prepareTechnicianTrackingLogout = async (technicianUid: string): Promise<void> => {
    const uid = String(technicianUid || '').trim();
    if (!uid) return;

    const stopResult = await stopLiveTracking(uid, undefined, 'PRESERVE');
    const replay = await replayForTechnician(uid);
    if ((stopResult.hadActiveSession && !stopResult.serverAcknowledged) || replay.pendingStops > 0) {
        const error = new Error(
            replay.terminal > 0
                ? 'Logout paused because a GPS STOP requires operations reconciliation.'
                : 'Logout paused until the active GPS session is stopped on the server. Reconnect and retry.',
        );
        (error as Error & { code?: string }).code = 'GPS_LOGOUT_STOP_PENDING';
        throw error;
    }

    purgeTechnicianGpsRetryQueue(uid);
};
""",
    'ordered logout helper',
)
tracking_path.write_text(tracking, encoding='utf-8')


portal_path = Path('src/components/PortalSessionControls.tsx')
portal = portal_path.read_text(encoding='utf-8')
portal = replace_once(
    portal,
    """import { purgeTechnicianGpsRetryQueue, stopLiveTracking } from '../utils/liveTracking';
""",
    """import { prepareTechnicianTrackingLogout } from '../utils/liveTracking';
""",
    'ordered logout import',
)
old_handler = """  const handleLogout = async () => {
    const technicianUid = role === 'technician' ? auth.currentUser?.uid : undefined;
    try {
      if (technicianUid) {
        await stopLiveTracking(technicianUid);
        purgeTechnicianGpsRetryQueue(technicianUid);
      }
      await clearSessionAndPreserveLanguage();
      await signOut(auth);
    } catch (error) {
      console.warn(`[${role}] Secure logout fallback triggered.`, error);
      try {
        if (technicianUid) {
          await stopLiveTracking(technicianUid);
          purgeTechnicianGpsRetryQueue(technicianUid);
        }
        await clearSessionAndPreserveLanguage();
        await signOut(auth);
      } catch {
        // Navigation below still terminates the local portal session. The server
        // watchdog remains authoritative if the STOP callable was unavailable.
      }
    } finally {
      window.location.replace(logoutRedirect || `/login?intendedRole=${role}&logout=1`);
    }
  };
"""
new_handler = """  const handleLogout = async () => {
    let shouldRedirect = false;
    const technicianUid = role === 'technician' ? auth.currentUser?.uid || '' : '';
    try {
      if (technicianUid) {
        await prepareTechnicianTrackingLogout(technicianUid);
      }
      await clearSessionAndPreserveLanguage();
      await signOut(auth);
      shouldRedirect = true;
    } catch (error: any) {
      console.warn(`[${role}] Secure logout fallback triggered.`, error);
      if (technicianUid && error?.code === 'GPS_LOGOUT_STOP_PENDING') {
        window.alert(error?.message || 'Logout paused until live GPS is stopped safely. Reconnect and retry.');
        return;
      }
      try {
        await signOut(auth);
        shouldRedirect = true;
      } catch {
        // Navigation remains disabled when authentication could not be terminated.
      }
    } finally {
      if (shouldRedirect) {
        window.location.replace(logoutRedirect || `/login?intendedRole=${role}&logout=1`);
      }
    }
  };
"""
portal = replace_once(portal, old_handler, new_handler, 'fail-closed logout handler')
portal_path.write_text(portal, encoding='utf-8')


test_path = Path('tests/launch/map-gps-state-behavior.test.mjs')
test_source = test_path.read_text(encoding='utf-8')
if "const portalSessionSource = readFileSync('src/components/PortalSessionControls.tsx', 'utf8');" not in test_source:
    test_source = replace_once(
        test_source,
        """const liveTrackingSource = readFileSync('src/utils/liveTracking.ts', 'utf8');
""",
        """const liveTrackingSource = readFileSync('src/utils/liveTracking.ts', 'utf8');
const portalSessionSource = readFileSync('src/components/PortalSessionControls.tsx', 'utf8');
""",
        'portal source fixture',
    )

test_source += """

test('Technician logout preserves STOP authority until server reconciliation completes', () => {
  const helperIndex = liveTrackingSource.indexOf('export const prepareTechnicianTrackingLogout');
  const stopIndex = liveTrackingSource.indexOf("await stopLiveTracking(uid, undefined, 'PRESERVE')", helperIndex);
  const replayIndex = liveTrackingSource.indexOf('await replayForTechnician(uid)', stopIndex);
  const pendingIndex = liveTrackingSource.indexOf('GPS_LOGOUT_STOP_PENDING', replayIndex);
  const purgeIndex = liveTrackingSource.indexOf('purgeTechnicianGpsRetryQueue(uid)', pendingIndex);
  assert.ok(helperIndex >= 0 && stopIndex > helperIndex && replayIndex > stopIndex && pendingIndex > replayIndex && purgeIndex > pendingIndex);
  assert.match(liveTrackingSource, /serverAcknowledged: stopAcknowledged \|\| stopSuperseded/);
  assert.match(liveTrackingSource, /replay\.pendingStops > 0/);

  const prepareIndex = portalSessionSource.indexOf('await prepareTechnicianTrackingLogout(technicianUid)');
  const clearIndex = portalSessionSource.indexOf('await clearSessionAndPreserveLanguage()', prepareIndex);
  const signOutIndex = portalSessionSource.indexOf('await signOut(auth)', clearIndex);
  assert.ok(prepareIndex >= 0 && clearIndex > prepareIndex && signOutIndex > clearIndex);
  assert.match(portalSessionSource, /error\?\.code === 'GPS_LOGOUT_STOP_PENDING'/);
  assert.match(portalSessionSource, /if \(shouldRedirect\)/);
  assert.doesNotMatch(portalSessionSource, /purgeTechnicianGpsRetryQueue\(technicianUid\)/);
});
"""
test_path.write_text(test_source, encoding='utf-8')
