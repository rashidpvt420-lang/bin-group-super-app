from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count was {count}, expected 1')
    return source.replace(old, new, 1)


map_path = Path('apps/admin-panel/src/pages/map/LiveMapPage.tsx')
source = map_path.read_text(encoding='utf-8')
source = replace_once(
    source,
    "  const markerRefs = useRef<any[]>([]);\n",
    "  const technicianMarkerRefs = useRef<Map<string, any>>(new Map());\n"
    "  const ticketMarkerRefs = useRef<Map<string, any>>(new Map());\n"
    "  const viewportInitializedRef = useRef(false);\n",
    'marker reference declaration',
)
effect_start = source.index("  useEffect(() => {\n    if (!mapReady || !mapRef.current) return;\n")
effect_end_marker = "  }, [freshLocations, mapReady, ticketsWithVerifiedPins]);\n"
effect_end = source.index(effect_end_marker, effect_start) + len(effect_end_marker)
replacement = '''  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const maps = (window as any).google?.maps;
    if (!maps) return;

    const visibleTechnicianIds = new Set<string>();
    const visibleTicketIds = new Set<string>();
    const initialBounds = new maps.LatLngBounds();
    let initialPointCount = 0;

    for (const location of freshLocations) {
      const point = mapCoordinate(location.location);
      if (!point) continue;
      visibleTechnicianIds.add(location.id);
      initialBounds.extend(point);
      initialPointCount += 1;
      const title = `${location.technicianName || 'Technician'} — fresh canonical GPS`;
      const existing = technicianMarkerRefs.current.get(location.id);
      if (existing) {
        existing.setPosition(point);
        existing.setTitle(title);
      } else {
        technicianMarkerRefs.current.set(location.id, new maps.Marker({
          map: mapRef.current,
          position: point,
          title,
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#10b981',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        }));
      }
    }
    technicianMarkerRefs.current.forEach((marker, id) => {
      if (!visibleTechnicianIds.has(id)) {
        marker.setMap(null);
        technicianMarkerRefs.current.delete(id);
      }
    });

    for (const { ticket, pin } of ticketsWithVerifiedPins) {
      const ticketId = String(ticket.id);
      visibleTicketIds.add(ticketId);
      initialBounds.extend(pin.point);
      initialPointCount += 1;
      const priority = String(ticket.priority || ticket.severity || '').toUpperCase();
      const title = `${ticket.propertyName || ticket.unit || ticket.id} — verified canonical property pin — ${displayStatus(ticket)}`;
      const icon = {
        path: maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: ['EMERGENCY', 'CRITICAL', 'P0'].includes(priority) ? '#ef4444' : '#3b82f6',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 1.5,
      };
      const existing = ticketMarkerRefs.current.get(ticketId);
      if (existing) {
        existing.setPosition(pin.point);
        existing.setTitle(title);
        existing.setIcon(icon);
      } else {
        ticketMarkerRefs.current.set(ticketId, new maps.Marker({
          map: mapRef.current,
          position: pin.point,
          title,
          icon,
        }));
      }
    }
    ticketMarkerRefs.current.forEach((marker, id) => {
      if (!visibleTicketIds.has(id)) {
        marker.setMap(null);
        ticketMarkerRefs.current.delete(id);
      }
    });

    if (!viewportInitializedRef.current && initialPointCount > 0) {
      mapRef.current.fitBounds(initialBounds, 72);
      if (initialPointCount == 1) mapRef.current.setZoom(15);
      viewportInitializedRef.current = true;
    }
  }, [freshLocations, mapReady, ticketsWithVerifiedPins]);

  useEffect(() => () => {
    technicianMarkerRefs.current.forEach((marker) => marker.setMap(null));
    ticketMarkerRefs.current.forEach((marker) => marker.setMap(null));
    technicianMarkerRefs.current.clear();
    ticketMarkerRefs.current.clear();
  }, []);
'''
source = source[:effect_start] + replacement + source[effect_end:]
map_path.write_text(source, encoding='utf-8')

tracking_path = Path('src/utils/liveTracking.ts')
source = tracking_path.read_text(encoding='utf-8')
source = replace_once(
    source,
    " * - UPDATE actions contain only the latest minimum coordinate for one session,\n *   live in sessionStorage, and expire after five minutes.\n",
    " * - UPDATE actions contain only the latest minimum coordinate for one session,\n *   live in module memory, and expire after five minutes.\n",
    'retry policy documentation',
)
source = replace_once(source, "    browserGpsQueueStorage,\n", "    browserGpsQueueStorage,\n    discardAllQueuedUpdates,\n", 'discard-all import')
source = replace_once(
    source,
    "            const stillQueued = readGpsRetryQueue().some((entry) => entry.technicianUid === technicianUid);\n",
    "            const stillQueued = readGpsRetryQueue(browserGpsQueueStorage(technicianUid))\n"
    "                .some((entry) => entry.technicianUid === technicianUid);\n",
    'scoped online recovery read',
)
source = replace_once(
    source,
    "    purgeGpsQueueForTechnician(technicianUid, browserGpsQueueStorage());\n",
    "    purgeGpsQueueForTechnician(technicianUid, browserGpsQueueStorage(technicianUid));\n",
    'scoped purge',
)
source = replace_once(
    source,
    "        retryStoragePolicy: 'STOP_LOCAL_NO_COORDINATES_UPDATE_SESSION_5_MINUTES',\n",
    "        retryStoragePolicy: 'UID_SCOPED_STOP_LOCAL_NO_COORDINATES_UPDATE_MEMORY_ONLY',\n",
    'diagnostic storage policy',
)
source = replace_once(
    source,
    "    purgeGpsQueuesExceptTechnician(technicianUid);\n    installOnlineRecovery(technicianUid, ticketId);\n",
    "    purgeGpsQueuesExceptTechnician(technicianUid);\n"
    "    discardAllQueuedUpdates(technicianUid);\n"
    "    installOnlineRecovery(technicianUid, ticketId);\n",
    'discard stale updates before replay',
)
tracking_path.write_text(source, encoding='utf-8')

controls_path = Path('src/components/PortalSessionControls.tsx')
source = controls_path.read_text(encoding='utf-8')
source = replace_once(
    source,
    "import { purgeTechnicianGpsRetryQueue } from '../utils/liveTracking';\n",
    "import { purgeTechnicianGpsRetryQueue, stopLiveTracking } from '../utils/liveTracking';\n",
    'logout tracking import',
)
old_handler = '''  const handleLogout = async () => {
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
'''
new_handler = '''  const handleLogout = async () => {
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
        // The server watchdog remains authoritative if STOP was unavailable.
      }
    } finally {
      window.location.replace(logoutRedirect || `/login?intendedRole=${role}&logout=1`);
    }
  };
'''
source = replace_once(source, old_handler, new_handler, 'secure logout handler')
controls_path.write_text(source, encoding='utf-8')

test_path = Path('tests/launch/maps-gps-product-truth.test.mjs')
source = test_path.read_text(encoding='utf-8')
source = replace_once(
    source,
    "test('Technician GPS client uses protected callable with durable STOP and short-lived UPDATE queues', () => {\n",
    "test('Technician GPS client uses protected callable with durable scoped STOP and memory-only UPDATE queues', () => {\n",
    'GPS queue test title',
)
old_assertions = '''  assert.match(gpsRetryQueue, /STOP_QUEUE_KEY = 'bin-technician-gps-stop-queue-v2'/);
  assert.match(gpsRetryQueue, /UPDATE_QUEUE_KEY = 'bin-technician-gps-update-queue-v2'/);
  assert.match(gpsRetryQueue, /stop: safeStorage\('localStorage'\)/);
  assert.match(gpsRetryQueue, /update: safeStorage\('sessionStorage'\)/);
'''
new_assertions = '''  assert.match(gpsRetryQueue, /STOP_QUEUE_KEY = 'bin-technician-gps-stop-queue-v3'/);
  assert.match(gpsRetryQueue, /UPDATE_QUEUE_KEY = 'bin-technician-gps-update-memory-v3'/);
  assert.match(gpsRetryQueue, /stop: scopedStorage\(safeStorage\('localStorage'\), technicianUid\)/);
  assert.match(gpsRetryQueue, /update: scopedStorage\(memoryStorage, technicianUid\)/);
  assert.match(gpsRetryQueue, /migrateAndRemoveLegacyGpsQueue/);
  assert.match(gpsRetryQueue, /GPS_STOP_MIGRATION_VERIFICATION_FAILED/);
  assert.match(gpsRetryQueue, /Legacy UPDATE coordinates are[\s\S]*never migrated/);
  assert.doesNotMatch(gpsRetryQueue, /update: safeStorage\('sessionStorage'\)/);
'''
source = replace_once(source, old_assertions, new_assertions, 'v3 queue assertions')
test_path.write_text(source, encoding='utf-8')

behavior_path = Path('tests/launch/map-gps-state-behavior.test.mjs')
source = behavior_path.read_text(encoding='utf-8')
source = replace_once(
    source,
    "const liveTrackingSource = readFileSync('src/utils/liveTracking.ts', 'utf8');\n",
    "const liveTrackingSource = readFileSync('src/utils/liveTracking.ts', 'utf8');\n"
    "const portalSessionSource = readFileSync('src/components/PortalSessionControls.tsx', 'utf8');\n",
    'portal source fixture',
)
source += '''

test('Technician logout tears down tracking before final queue purge and sign-out', () => {
  const stopIndex = portalSessionSource.indexOf('await stopLiveTracking(technicianUid)');
  const purgeIndex = portalSessionSource.indexOf('purgeTechnicianGpsRetryQueue(technicianUid)', stopIndex);
  const clearIndex = portalSessionSource.indexOf('await clearSessionAndPreserveLanguage()', purgeIndex);
  const signOutIndex = portalSessionSource.indexOf('await signOut(auth)', clearIndex);
  assert.ok(stopIndex >= 0 && purgeIndex > stopIndex && clearIndex > purgeIndex && signOutIndex > clearIndex);
});

test('current server supersession acknowledgement remains intact after privacy hardening', () => {
  assert.match(liveTrackingSource, /stopSuperseded = response\.superseded/);
  assert.match(liveTrackingSource, /STOP_SUPERSEDED_RECONCILED/);
  assert.match(liveTrackingSource, /canonicalSessionUnchanged: true/);
});
'''
behavior_path.write_text(source, encoding='utf-8')
