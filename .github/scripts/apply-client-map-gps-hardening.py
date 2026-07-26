from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


# Wire the v3 queue into the live tracking client.
tracking_path = Path('src/utils/liveTracking.ts')
tracking = tracking_path.read_text(encoding='utf-8')
tracking = replace_once(
    tracking,
    """    browserGpsQueueStorage,
    discardQueuedSessionUpdates,
""",
    """    browserGpsQueueStorage,
    discardAllQueuedUpdates,
    discardQueuedSessionUpdates,
""",
    'discard-all import',
)
tracking = replace_once(
    tracking,
    """            const stillQueued = readGpsRetryQueue().some((entry) => entry.technicianUid === technicianUid);
""",
    """            const stillQueued = readGpsRetryQueue(browserGpsQueueStorage(technicianUid))
                .some((entry) => entry.technicianUid === technicianUid);
""",
    'scoped online queue read',
)
tracking = replace_once(
    tracking,
    """export function purgeTechnicianGpsRetryQueue(technicianUid: string) {
    purgeGpsQueueForTechnician(technicianUid, browserGpsQueueStorage());
""",
    """export function purgeTechnicianGpsRetryQueue(technicianUid: string) {
    purgeGpsQueueForTechnician(technicianUid, browserGpsQueueStorage(technicianUid));
""",
    'scoped explicit purge',
)
tracking = replace_once(
    tracking,
    """        retryStoragePolicy: 'STOP_LOCAL_NO_COORDINATES_UPDATE_SESSION_5_MINUTES',
""",
    """        retryStoragePolicy: 'UID_SCOPED_STOP_LOCAL_NO_COORDINATES_UPDATE_MEMORY_ONLY',
""",
    'diagnostic storage policy',
)
tracking = replace_once(
    tracking,
    """    purgeGpsQueuesExceptTechnician(technicianUid);
    installOnlineRecovery(technicianUid, ticketId);

    const replay = await replayForTechnician(technicianUid, ticketId);
""",
    """    purgeGpsQueuesExceptTechnician(technicianUid);
    // Precise UPDATE coordinates are memory-only and never cross ticket/session
    // authority. Retain only coordinate-free STOP reconciliation before replay.
    discardAllQueuedUpdates(technicianUid);
    installOnlineRecovery(technicianUid, ticketId);

    const replay = await replayForTechnician(technicianUid, ticketId);
""",
    'cross-ticket update disposal',
)
tracking_path.write_text(tracking, encoding='utf-8')

# Make logout purge explicit even if generic browser-storage cleanup fails.
controls_path = Path('src/components/PortalSessionControls.tsx')
controls = controls_path.read_text(encoding='utf-8')
controls = replace_once(
    controls,
    """import { clearOnboardingSessionArtifacts } from '../lib/onboardingDb';
import SafeIcon from './SafeIcon';
""",
    """import { clearOnboardingSessionArtifacts } from '../lib/onboardingDb';
import { purgeTechnicianGpsRetryQueue } from '../utils/liveTracking';
import SafeIcon from './SafeIcon';
""",
    'logout purge import',
)
controls = replace_once(
    controls,
    """  const handleLogout = async () => {
    try {
      await clearSessionAndPreserveLanguage();
""",
    """  const handleLogout = async () => {
    try {
      if (role === 'technician' && auth.currentUser?.uid) {
        purgeTechnicianGpsRetryQueue(auth.currentUser.uid);
      }
      await clearSessionAndPreserveLanguage();
""",
    'primary logout purge',
)
controls = replace_once(
    controls,
    """      console.warn(`[${role}] Secure logout fallback triggered.`, error);
      try {
        await signOut(auth);
""",
    """      console.warn(`[${role}] Secure logout fallback triggered.`, error);
      try {
        if (role === 'technician' && auth.currentUser?.uid) {
          purgeTechnicianGpsRetryQueue(auth.currentUser.uid);
        }
        await signOut(auth);
""",
    'fallback logout purge',
)
controls_path.write_text(controls, encoding='utf-8')

# Preserve the Admin's viewport while freshness ticks update marker membership.
map_path = Path('apps/admin-panel/src/pages/map/LiveMapPage.tsx')
map_source = map_path.read_text(encoding='utf-8')
map_source = replace_once(
    map_source,
    """  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);
""",
    """  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const technicianMarkerRefs = useRef<Map<string, any>>(new Map());
  const ticketMarkerRefs = useRef<Map<string, any>>(new Map());
  const viewportInitializedRef = useRef(false);
""",
    'marker refs',
)
old_effect = """  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const maps = (window as any).google?.maps;
    if (!maps) return;

    markerRefs.current.forEach((marker) => marker.setMap(null));
    markerRefs.current = [];
    const bounds = new maps.LatLngBounds();
    let pointCount = 0;

    for (const location of freshLocations) {
      const point = mapCoordinate(location.location);
      if (!point) continue;
      const marker = new maps.Marker({
        map: mapRef.current,
        position: point,
        title: `${location.technicianName || 'Technician'} — fresh canonical GPS`,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      markerRefs.current.push(marker);
      bounds.extend(point);
      pointCount += 1;
    }

    for (const { ticket, pin } of ticketsWithVerifiedPins) {
      const priority = String(ticket.priority || ticket.severity || '').toUpperCase();
      const marker = new maps.Marker({
        map: mapRef.current,
        position: pin.point,
        title: `${ticket.propertyName || ticket.unit || ticket.id} — verified canonical property pin — ${displayStatus(ticket)}`,
        icon: {
          path: maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: ['EMERGENCY', 'CRITICAL', 'P0'].includes(priority) ? '#ef4444' : '#3b82f6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
        },
      });
      markerRefs.current.push(marker);
      bounds.extend(pin.point);
      pointCount += 1;
    }

    if (pointCount > 0) {
      mapRef.current.fitBounds(bounds, 72);
      if (pointCount === 1) mapRef.current.setZoom(15);
    } else {
      mapRef.current.setCenter(UAE_CENTRE);
      mapRef.current.setZoom(7);
    }
  }, [freshLocations, mapReady, ticketsWithVerifiedPins]);
"""
new_effect = """  useEffect(() => {
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
map_source = replace_once(map_source, old_effect, new_effect, 'in-place marker effect')
map_path.write_text(map_source, encoding='utf-8')

# Extend launch tests without weakening existing behavioral scenarios.
test_path = Path('tests/launch/map-gps-state-behavior.test.mjs')
test_source = test_path.read_text(encoding='utf-8')
test_source += """

test('browser queue defaults keep coordinates in memory and scope STOP persistence by Technician UID', () => {
  const queueSource = readFileSync('src/utils/gpsRetryQueue.ts', 'utf8');
  assert.match(queueSource, /update: scopedStorage\(memoryStorage, technicianUid\)/);
  assert.match(queueSource, /stop: scopedStorage\(safeStorage\('localStorage'\), technicianUid\)/);
  assert.match(queueSource, /scopedKey\(key, uid\)/);
  assert.match(queueSource, /map\(\(\{ point: _discardedPoint, \.\.\.entry \}\) => entry\)/);
  assert.match(queueSource, /discardAllQueuedUpdates/);
  assert.doesNotMatch(queueSource, /update: safeStorage\('sessionStorage'\)/);
});

test('freshness ticks update marker membership without resetting the Admin viewport', () => {
  const mapSource = readFileSync('apps/admin-panel/src/pages/map/LiveMapPage.tsx', 'utf8');
  assert.match(mapSource, /technicianMarkerRefs = useRef<Map<string, any>>/);
  assert.match(mapSource, /ticketMarkerRefs = useRef<Map<string, any>>/);
  assert.match(mapSource, /if \(!viewportInitializedRef\.current && initialPointCount > 0\)/);
  assert.match(mapSource, /existing\.setPosition/);
  assert.match(mapSource, /marker\.setMap\(null\)/);
  assert.doesNotMatch(mapSource, /markerRefs\.current\.forEach/);
});

test('new ticket startup discards stale UPDATE coordinates before STOP reconciliation', () => {
  assert.match(liveTrackingSource, /discardAllQueuedUpdates\(technicianUid\)/);
  assert.match(liveTrackingSource, /readGpsRetryQueue\(browserGpsQueueStorage\(technicianUid\)\)/);
});
"""
test_path.write_text(test_source, encoding='utf-8')

maps_test_path = Path('tests/launch/maps-gps-product-truth.test.mjs')
maps_test = maps_test_path.read_text(encoding='utf-8')
maps_test = maps_test.replace(
    "assert.match(liveTracking, /STOP_LOCAL_NO_COORDINATES_UPDATE_SESSION_5_MINUTES/);",
    "assert.match(liveTracking, /UID_SCOPED_STOP_LOCAL_NO_COORDINATES_UPDATE_MEMORY_ONLY/);",
)
maps_test_path.write_text(maps_test, encoding='utf-8')
