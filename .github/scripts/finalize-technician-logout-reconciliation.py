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
            enqueueGpsRetryAction({
                action: 'STOP',
""",
    'stop queue branch',
)
tracking = replace_once(
    tracking,
    """                queuedAtMs: Date.now(),
            });
            installOnlineRecovery(uid, activeTicketId);
""",
    """                queuedAtMs: Date.now(),
            });
            stopQueued = hasPendingGpsStop(uid);
            installOnlineRecovery(uid, activeTicketId);
""",
    'stop queue persistence truth',
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
    const replayReconciled = stopResult.stopQueued && replay.succeeded > 0 && replay.pendingStops === 0;
    const stopSafe = !stopResult.hadActiveSession || stopResult.serverAcknowledged || replayReconciled;
    if (!stopSafe || replay.pendingStops > 0) {
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
    "import { purgeTechnicianGpsRetryQueue, stopLiveTracking } from '../utils/liveTracking';\n",
    "import { prepareTechnicianTrackingLogout } from '../utils/liveTracking';\n",
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
      if (technicianUid) {
        const message = error?.code === 'GPS_LOGOUT_STOP_PENDING'
          ? error?.message
          : 'Logout paused because live GPS teardown could not be verified. Reconnect and retry.';
        window.alert(message || 'Logout paused until live GPS is stopped safely.');
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
obsolete = """\n\ntest('Technician logout tears down tracking before final queue purge and sign-out', () => {
  const stopIndex = portalSessionSource.indexOf('await stopLiveTracking(technicianUid)');
  const purgeIndex = portalSessionSource.indexOf('purgeTechnicianGpsRetryQueue(technicianUid)', stopIndex);
  const clearIndex = portalSessionSource.indexOf('await clearSessionAndPreserveLanguage()', purgeIndex);
  const signOutIndex = portalSessionSource.indexOf('await signOut(auth)', clearIndex);
  assert.ok(stopIndex >= 0 && purgeIndex > stopIndex && clearIndex > purgeIndex && signOutIndex > clearIndex);
});
"""
if test_source.count(obsolete) != 1:
    raise SystemExit('obsolete direct logout test was not unique')
test_source = test_source.replace(obsolete, '', 1)
test_source = test_source.replace(
    "  assert.match(liveTrackingSource, /Promise<StopLiveTrackingResult>/);\n",
    "  assert.match(liveTrackingSource, /Promise<StopLiveTrackingResult>/);\n"
    "  assert.match(liveTrackingSource, /const replayReconciled = stopResult\.stopQueued && replay\.succeeded > 0 && replay\.pendingStops === 0/);\n"
    "  assert.match(liveTrackingSource, /const stopSafe = !stopResult\.hadActiveSession \|\| stopResult\.serverAcknowledged \|\| replayReconciled/);\n",
    1,
)
test_path.write_text(test_source, encoding='utf-8')
