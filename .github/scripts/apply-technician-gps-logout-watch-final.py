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
    """    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = createTrackingSessionId();
    _state.lastPushTime = 0;

    _state.watchId = navigator.geolocation.watchPosition(
""",
    """    const trackingSessionId = createTrackingSessionId();
    let captureLastPushTime = 0;
    let installedWatchId: number;

    try {
        installedWatchId = navigator.geolocation.watchPosition(
""",
    'pre-install state publication',
)
tracking = replace_once(
    tracking,
    """            if (now - _state.lastPushTime < CAPTURE_INTERVAL_MS) return;
""",
    """            if (now - captureLastPushTime < CAPTURE_INTERVAL_MS) return;
""",
    'capture throttle read',
)
tracking = replace_once(
    tracking,
    """            _state.lastPushTime = now;
            const sessionId = _state.trackingSessionId;
            if (!sessionId) return;
""",
    """            captureLastPushTime = now;
            _state.lastPushTime = now;
            const sessionId = trackingSessionId;
""",
    'capture session closure',
)
watch_end = """        },
    );
};

export const stopLiveTracking"""
tracking = replace_once(
    tracking,
    watch_end,
    """        },
        );
    } catch (error) {
        detachOnlineRecovery();
        const message = 'Unable to start the browser GPS watch.';
        await persistTrackingDiagnostic(technicianUid, ticketId, {
            status: 'WATCH_INSTALL_FAILED',
            error: message,
            errorCode: String((error as any)?.code || 'WATCH_INSTALL_FAILED').slice(0, 80),
            failedAt: serverTimestamp(),
        });
        onError?.(message);
        throw error instanceof Error ? error : new Error(message);
    }

    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = trackingSessionId;
    _state.lastPushTime = captureLastPushTime;
    _state.watchId = installedWatchId;
};

export type StopLiveTrackingResult = {
    hadActiveSession: boolean;
    serverAcknowledged: boolean;
    superseded: boolean;
    stopQueued: boolean;
};

export const stopLiveTracking""",
    'watch installation completion',
)
tracking = replace_once(
    tracking,
    """    finalStatus: StopTrackingStatus = 'PRESERVE',
): Promise<void> => {
""",
    """    finalStatus: StopTrackingStatus = 'PRESERVE',
): Promise<StopLiveTrackingResult> => {
""",
    'stop result signature',
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
    "import { purgeTechnicianGpsRetryQueue } from '../utils/liveTracking';\n",
    "import { prepareTechnicianTrackingLogout } from '../utils/liveTracking';\n",
    'logout helper import',
)
old_handler = """  const handleLogout = async () => {
    try {
      if (role === 'technician' && auth.currentUser?.uid) {
        purgeTechnicianGpsRetryQueue(auth.currentUser.uid);
      }
      await clearSessionAndPreserveLanguage();
      await signOut(auth);
    } catch (error) {
      console.warn(`[${role}] Secure logout fallback triggered.`, error);
      try {
        if (role === 'technician' && auth.currentUser?.uid) {
          purgeTechnicianGpsRetryQueue(auth.currentUser.uid);
        }
        await signOut(auth);
      } catch {
        // Navigation below still terminates the local portal session.
      }
    } finally {
      window.location.replace(logoutRedirect || `/login?intendedRole=${role}&logout=1`);
    }
  };
"""
new_handler = """  const handleLogout = async () => {
    const technicianUid = role === 'technician' ? auth.currentUser?.uid || '' : '';

    if (technicianUid) {
      try {
        await prepareTechnicianTrackingLogout(technicianUid);
      } catch (error: any) {
        console.warn('[technician] Logout paused until GPS teardown is verified.', error);
        const message = error?.code === 'GPS_LOGOUT_STOP_PENDING'
          ? error?.message
          : 'Logout paused because live GPS teardown could not be verified. Reconnect and retry.';
        window.alert(message || 'Logout paused until live GPS is stopped safely.');
        return;
      }
    }

    let shouldRedirect = false;
    try {
      await clearSessionAndPreserveLanguage();
      await signOut(auth);
      shouldRedirect = true;
    } catch (error) {
      console.warn(`[${role}] Secure logout fallback triggered.`, error);
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
tests = test_path.read_text(encoding='utf-8')
fixture = "const portalSessionSource = readFileSync('src/components/PortalSessionControls.tsx', 'utf8');\n"
if fixture not in tests:
    tests = replace_once(
        tests,
        "const liveTrackingSource = readFileSync('src/utils/liveTracking.ts', 'utf8');\n",
        "const liveTrackingSource = readFileSync('src/utils/liveTracking.ts', 'utf8');\n" + fixture,
        'portal source fixture',
    )
tests += """

test('tracking state is published only after browser watch installation succeeds', () => {
  const installIndex = liveTrackingSource.indexOf('installedWatchId = navigator.geolocation.watchPosition');
  const failureIndex = liveTrackingSource.indexOf("status: 'WATCH_INSTALL_FAILED'", installIndex);
  const publishIndex = liveTrackingSource.indexOf('_state.activeTicketId = ticketId', failureIndex);
  assert.ok(installIndex >= 0 && failureIndex > installIndex && publishIndex > failureIndex);
  assert.match(liveTrackingSource, /const trackingSessionId = createTrackingSessionId\(\)/);
  assert.match(liveTrackingSource, /const sessionId = trackingSessionId/);
  assert.match(liveTrackingSource, /_state\.watchId = installedWatchId/);
});

test('Technician logout reconciles canonical STOP before purge and authentication removal', () => {
  const helperIndex = liveTrackingSource.indexOf('export const prepareTechnicianTrackingLogout');
  const stopIndex = liveTrackingSource.indexOf("await stopLiveTracking(uid, undefined, 'PRESERVE')", helperIndex);
  const replayIndex = liveTrackingSource.indexOf('await replayForTechnician(uid)', stopIndex);
  const safeIndex = liveTrackingSource.indexOf('const stopSafe =', replayIndex);
  const pendingIndex = liveTrackingSource.indexOf('GPS_LOGOUT_STOP_PENDING', safeIndex);
  const purgeIndex = liveTrackingSource.indexOf('purgeTechnicianGpsRetryQueue(uid)', pendingIndex);
  assert.ok(helperIndex >= 0 && stopIndex > helperIndex && replayIndex > stopIndex && safeIndex > replayIndex && pendingIndex > safeIndex && purgeIndex > pendingIndex);
  assert.match(liveTrackingSource, /Promise<StopLiveTrackingResult>/);
  assert.match(liveTrackingSource, /stopQueued = hasPendingGpsStop\(uid\)/);
  assert.match(liveTrackingSource, /const replayReconciled = stopResult\.stopQueued && replay\.succeeded > 0 && replay\.pendingStops === 0/);

  const prepareIndex = portalSessionSource.indexOf('await prepareTechnicianTrackingLogout(technicianUid)');
  const clearIndex = portalSessionSource.indexOf('await clearSessionAndPreserveLanguage()', prepareIndex);
  const signOutIndex = portalSessionSource.indexOf('await signOut(auth)', clearIndex);
  assert.ok(prepareIndex >= 0 && clearIndex > prepareIndex && signOutIndex > clearIndex);
  assert.match(portalSessionSource, /error\?\.code === 'GPS_LOGOUT_STOP_PENDING'/);
  assert.match(portalSessionSource, /if \(shouldRedirect\)/);
  assert.doesNotMatch(portalSessionSource, /purgeTechnicianGpsRetryQueue\(auth\.currentUser/);
});
"""
test_path.write_text(tests, encoding='utf-8')

policy_path = Path('docs/technician-gps-client-storage-policy.md')
policy = policy_path.read_text(encoding='utf-8')
policy = replace_once(
    policy,
    "The controlled pilot uses foreground browser geolocation. A Technician is shown as live only while the mission page owns an active geolocation watch and the canonical server session remains fresh.\n",
    "The controlled pilot uses foreground browser geolocation. A Technician is shown as live only while the mission page owns an active geolocation watch and the canonical server session remains fresh. Candidate tracking state is not published until the browser returns a valid watch ID; synchronous installation failure is recorded as `WATCH_INSTALL_FAILED` and rejects startup.\n",
    'watch installation policy',
)
policy = replace_once(
    policy,
    "Legacy global queue keys are deleted after verified STOP migration. Starting under another Technician account removes other UID scopes. Secure Technician logout explicitly purges the authenticated UID queue in addition to the general portal storage cleanup.\n",
    "Legacy global queue keys are deleted after verified STOP migration. Starting under another Technician account removes other UID scopes. Secure Technician logout first clears the foreground watch, submits the canonical STOP, and immediately replays any queued STOP while Firebase authentication is still available. The authenticated UID queue is purged only after reconciliation succeeds; otherwise logout and navigation remain blocked.\n",
    'logout reconciliation policy',
)
policy_path.write_text(policy, encoding='utf-8')
