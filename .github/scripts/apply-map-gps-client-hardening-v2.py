from pathlib import Path
import re


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label} marker count was {count}, expected 1")
    return source.replace(old, new, 1)


map_path = Path('apps/admin-panel/src/pages/map/LiveMapPage.tsx')
map_source = map_path.read_text(encoding='utf-8')
map_source = replace_once(
    map_source,
    "  const markerRefs = useRef<any[]>([]);\n",
    "  const technicianMarkerRefs = useRef<Map<string, any>>(new Map());\n"
    "  const ticketMarkerRefs = useRef<Map<string, any>>(new Map());\n"
    "  const viewportInitializedRef = useRef(false);\n",
    'Admin map marker references',
)

map_effect_pattern = re.compile(
    r"  useEffect\(\(\) => \{\n"
    r"    if \(!mapReady \|\| !mapRef\.current\) return;\n"
    r"    const maps = \(window as any\)\.google\?\.maps;\n"
    r"    if \(!maps\) return;\n[\s\S]*?"
    r"  \}, \[freshLocations, mapReady, ticketsWithVerifiedPins\]\);\n",
)
map_effect_replacement = """  useEffect(() => {
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
      visibleTicketIds.add(ticket.id);
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
      const existing = ticketMarkerRefs.current.get(ticket.id);
      if (existing) {
        existing.setPosition(pin.point);
        existing.setTitle(title);
        existing.setIcon(icon);
      } else {
        ticketMarkerRefs.current.set(ticket.id, new maps.Marker({
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

    // Freshness ticks may remove markers, but they must never override an
    // Admin's manual pan or zoom. Auto-fit is restricted to the first non-empty
    // canonical source set after map initialisation.
    if (!viewportInitializedRef.current && initialPointCount > 0) {
      mapRef.current.fitBounds(initialBounds, 72);
      if (initialPointCount === 1) mapRef.current.setZoom(15);
      viewportInitializedRef.current = true;
    }
  }, [freshLocations, mapReady, ticketsWithVerifiedPins]);

  useEffect(() => () => {
    technicianMarkerRefs.current.forEach((marker) => marker.setMap(null));
    ticketMarkerRefs.current.forEach((marker) => marker.setMap(null));
    technicianMarkerRefs.current.clear();
    ticketMarkerRefs.current.clear();
  }, []);
"""
map_source, map_effect_count = map_effect_pattern.subn(map_effect_replacement, map_source, count=1)
if map_effect_count != 1:
    raise SystemExit(f'Admin map marker effect match count was {map_effect_count}, expected 1')
for required in [
    'TICKET_STATUS_QUERY_CHUNKS = unresolvedMaintenanceTicketStatusQueryChunks()',
    'technicianMarkerRefs.current.get(location.id)',
    'ticketMarkerRefs.current.get(ticket.id)',
    '!viewportInitializedRef.current && initialPointCount > 0',
]:
    if required not in map_source:
        raise SystemExit(f'Admin map combined contract is missing: {required}')
map_path.write_text(map_source, encoding='utf-8')

tracking_path = Path('src/utils/liveTracking.ts')
tracking = tracking_path.read_text(encoding='utf-8')
tracking = replace_once(
    tracking,
    "    browserGpsQueueStorage,\n    discardQueuedSessionUpdates,\n",
    "    browserGpsQueueStorage,\n    discardAllQueuedUpdates,\n    discardQueuedSessionUpdates,\n",
    'memory-only UPDATE import',
)
tracking = replace_once(
    tracking,
    "            const stillQueued = readGpsRetryQueue().some((entry) => entry.technicianUid === technicianUid);\n",
    "            const stillQueued = readGpsRetryQueue(browserGpsQueueStorage(technicianUid))\n"
    "                .some((entry) => entry.technicianUid === technicianUid);\n",
    'UID-scoped online recovery read',
)
tracking = replace_once(
    tracking,
    "    purgeGpsQueueForTechnician(technicianUid, browserGpsQueueStorage());\n",
    "    purgeGpsQueueForTechnician(technicianUid, browserGpsQueueStorage(technicianUid));\n",
    'UID-scoped secure purge',
)
tracking = replace_once(
    tracking,
    "        retryStoragePolicy: 'STOP_LOCAL_NO_COORDINATES_UPDATE_SESSION_5_MINUTES',\n",
    "        retryStoragePolicy: 'UID_SCOPED_STOP_LOCAL_NO_COORDINATES_UPDATE_MEMORY_ONLY',\n",
    'diagnostic storage policy',
)
tracking = replace_once(
    tracking,
    "    purgeGpsQueuesExceptTechnician(technicianUid);\n    installOnlineRecovery(technicianUid, ticketId);\n",
    "    purgeGpsQueuesExceptTechnician(technicianUid);\n"
    "    // Precise UPDATE coordinates are memory-only and cannot cross ticket or session authority.\n"
    "    discardAllQueuedUpdates(technicianUid);\n"
    "    installOnlineRecovery(technicianUid, ticketId);\n",
    'stale UPDATE disposal before STOP replay',
)
for required in [
    'stopSuperseded = response.superseded',
    'STOP_SUPERSEDED_RECONCILED',
    'canonicalSessionUnchanged: true',
    'discardAllQueuedUpdates(technicianUid)',
    'browserGpsQueueStorage(technicianUid)',
]:
    if required not in tracking:
        raise SystemExit(f'Combined GPS CAS/privacy contract is missing: {required}')
tracking_path.write_text(tracking, encoding='utf-8')

truth_path = Path('tests/launch/maps-gps-product-truth.test.mjs')
truth = truth_path.read_text(encoding='utf-8')
truth = replace_once(
    truth,
    "  assert.match(gpsRetryQueue, /STOP_QUEUE_KEY = 'bin-technician-gps-stop-queue-v2'/);\n"
    "  assert.match(gpsRetryQueue, /UPDATE_QUEUE_KEY = 'bin-technician-gps-update-queue-v2'/);\n"
    "  assert.match(gpsRetryQueue, /stop: safeStorage\\('localStorage'\\)/);\n"
    "  assert.match(gpsRetryQueue, /update: safeStorage\\('sessionStorage'\\)/);\n",
    "  assert.match(gpsRetryQueue, /STOP_QUEUE_KEY = 'bin-technician-gps-stop-queue-v3'/);\n"
    "  assert.match(gpsRetryQueue, /UPDATE_QUEUE_KEY = 'bin-technician-gps-update-memory-v3'/);\n"
    "  assert.match(gpsRetryQueue, /stop: scopedStorage\\(safeStorage\\('localStorage'\\), technicianUid\\)/);\n"
    "  assert.match(gpsRetryQueue, /update: scopedStorage\\(memoryStorage, technicianUid\\)/);\n"
    "  assert.match(gpsRetryQueue, /migrateAndRemoveLegacyGpsQueue/);\n"
    "  assert.match(gpsRetryQueue, /GPS_STOP_MIGRATION_VERIFICATION_FAILED/);\n"
    "  assert.match(gpsRetryQueue, /Legacy UPDATE coordinates are[\\s\\S]*never migrated/);\n"
    "  assert.doesNotMatch(gpsRetryQueue, /update: safeStorage\\('sessionStorage'\\)/);\n",
    'GPS queue source contract assertions',
)
for required in [
    'stopSuperseded = response\\.superseded',
    "STOP_QUEUE_KEY = 'bin-technician-gps-stop-queue-v3'",
    "UPDATE_QUEUE_KEY = 'bin-technician-gps-update-memory-v3'",
]:
    if required not in truth:
        raise SystemExit(f'Combined map/GPS launch regression is missing: {required}')
truth_path.write_text(truth, encoding='utf-8')
