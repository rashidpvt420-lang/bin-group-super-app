from pathlib import Path

path = Path('apps/admin-panel/src/pages/map/LiveMapPage.tsx')
source = path.read_text(encoding='utf-8')
start = source.index('const recordedTicketCoordinate = (ticket: any): Coordinate | null =>')
end = source.index('const liveLocationIsFresh =', start)
replacement = r'''const recordedTicketCoordinate = (ticket: any): Coordinate | null =>
  coordinate(ticket?.dispatchGeoSnapshot?.location) ||
  coordinate(ticket?.canonicalPropertyPinSnapshot?.location) ||
  coordinate(ticket?.jobLocation) ||
  coordinate(ticket?.propertyLocation) ||
  coordinate(ticket?.location) ||
  null;

type AuthoritativePinCandidate = {
  point: Coordinate;
  metadata: any;
  source: 'DISPATCH_SNAPSHOT' | 'CANONICAL_PROPERTY_SNAPSHOT';
  immutable: boolean;
};

const authoritativePinCandidate = (ticket: any): AuthoritativePinCandidate | null => {
  const dispatchSnapshot = ticket?.dispatchGeoSnapshot;
  const dispatchPoint = coordinate(dispatchSnapshot?.location || dispatchSnapshot?.pin || dispatchSnapshot?.coordinate);
  const dispatchMetadata = dispatchSnapshot?.verification;
  if (dispatchPoint && dispatchMetadata) {
    return {
      point: dispatchPoint,
      metadata: dispatchMetadata,
      source: 'DISPATCH_SNAPSHOT',
      immutable: dispatchSnapshot?.immutable === true || dispatchMetadata?.immutableSnapshot === true,
    };
  }

  const canonicalSnapshot = ticket?.canonicalPropertyPinSnapshot;
  const canonicalPoint = coordinate(canonicalSnapshot?.location || canonicalSnapshot?.pin || canonicalSnapshot?.coordinate);
  const canonicalMetadata = canonicalSnapshot?.verification;
  const boundPropertyId = text(canonicalSnapshot?.propertyId || canonicalMetadata?.canonicalPropertyId);
  if (
    canonicalPoint &&
    canonicalMetadata &&
    boundPropertyId &&
    boundPropertyId === text(ticket?.propertyId)
  ) {
    return {
      point: canonicalPoint,
      metadata: canonicalMetadata,
      source: 'CANONICAL_PROPERTY_SNAPSHOT',
      immutable: canonicalSnapshot?.immutable === true || canonicalMetadata?.immutableSnapshot === true,
    };
  }

  return null;
};

/**
 * Authoritative Admin-map pin contract.
 *
 * Coordinate and verification metadata must come from the same immutable
 * dispatch or canonical-property snapshot. Legacy job/property/location fields
 * remain recorded feed data and can never inherit verification from elsewhere.
 */
export const verifiedTicketPin = (ticket: any, nowMs = Date.now()): VerifiedTicketPin | null => {
  const candidate = authoritativePinCandidate(ticket);
  if (!candidate) return null;
  const { point, metadata } = candidate;

  const status = text(metadata.status).toUpperCase();
  const verified = metadata.verified === true || status === 'VERIFIED';
  const dispatchReady = metadata.dispatchReady === true;
  const verifiedBy = text(metadata.verifiedByUid || metadata.verifiedBy || metadata.verifierUid);
  const verifiedAtMs = timestampMillis(metadata.verifiedAt || metadata.verificationTimestamp || metadata.reviewedAt);
  const captureSource = text(metadata.captureSource || metadata.source || metadata.captureMethod).toUpperCase();
  const confidence = text(metadata.confidence || metadata.verificationConfidence).toUpperCase();
  const accuracyMeters = Number(metadata.accuracyMeters ?? metadata.accuracy ?? metadata.horizontalAccuracyMeters);
  const accuracyIsMeasured = Number.isFinite(accuracyMeters) && accuracyMeters > 0 && accuracyMeters <= 100;
  const confidenceIsAuthoritative = ['HIGH', 'VERIFIED', 'SURVEYED'].includes(confidence);

  if (!verified || !dispatchReady || !verifiedBy || !verifiedAtMs || !captureSource || !candidate.immutable) return null;
  if (verifiedAtMs > nowMs + MAX_VERIFICATION_FUTURE_SKEW_MS) return null;
  if (NON_AUTHORITATIVE_PIN_SOURCE.test(captureSource)) return null;
  if (!accuracyIsMeasured && !confidenceIsAuthoritative) return null;

  return {
    point,
    verifiedAtMs,
    verifiedBy,
    captureSource,
    accuracyMeters: accuracyIsMeasured ? accuracyMeters : null,
    confidence,
  };
};

'''
source = source[:start] + replacement + source[end:]

old_refs = """  const mapRef = useRef<any>(null);
  const markerRefs = useRef<any[]>([]);"""
new_refs = """  const mapRef = useRef<any>(null);
  const markerRefs = useRef<Map<string, any>>(new Map());
  const hasAutoFittedViewportRef = useRef(false);"""
if old_refs not in source:
    raise SystemExit('marker reference block no longer matches reviewed source')
source = source.replace(old_refs, new_refs, 1)

marker_start = source.index("  useEffect(() => {\n    if (!mapReady || !mapRef.current) return;", source.index('const ticketsWithVerifiedPins'))
marker_end_text = "  }, [freshLocations, mapReady, ticketsWithVerifiedPins]);"
marker_end = source.index(marker_end_text, marker_start) + len(marker_end_text)
marker_effect = r'''  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const maps = (window as any).google?.maps;
    if (!maps) return;

    const bounds = new maps.LatLngBounds();
    const activeMarkerKeys = new Set<string>();
    let pointCount = 0;

    const upsertMarker = (key: string, options: any, point: Coordinate) => {
      activeMarkerKeys.add(key);
      let marker = markerRefs.current.get(key);
      if (!marker) {
        marker = new maps.Marker({ map: mapRef.current, ...options });
        markerRefs.current.set(key, marker);
      } else {
        marker.setMap(mapRef.current);
        marker.setPosition(options.position);
        marker.setTitle(options.title);
        marker.setIcon(options.icon);
      }
      bounds.extend(point);
      pointCount += 1;
    };

    for (const location of freshLocations) {
      const point = coordinate(location.location);
      if (!point) continue;
      upsertMarker(`technician:${location.id}`, {
        position: point,
        title: `${location.technicianName || 'Technician'} — fresh foreground GPS`,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: '#10b981',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      }, point);
    }

    for (const { ticket, verifiedPin } of ticketsWithVerifiedPins as Array<{ ticket: any; verifiedPin: VerifiedTicketPin }>) {
      const priority = text(ticket.priority || ticket.severity).toUpperCase();
      upsertMarker(`ticket:${ticket.id}`, {
        position: verifiedPin.point,
        title: `${ticket.propertyName || ticket.unit || ticket.id} — verified property pin — ${displayStatus(ticket)}`,
        icon: {
          path: maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: ['EMERGENCY', 'CRITICAL', 'P0'].includes(priority) ? '#ef4444' : '#3b82f6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
        },
      }, verifiedPin.point);
    }

    for (const [key, marker] of markerRefs.current.entries()) {
      if (activeMarkerKeys.has(key)) continue;
      marker.setMap(null);
      markerRefs.current.delete(key);
    }

    if (!hasAutoFittedViewportRef.current && pointCount > 0) {
      mapRef.current.fitBounds(bounds, 72);
      if (pointCount === 1) mapRef.current.setZoom(15);
      hasAutoFittedViewportRef.current = true;
    }
  }, [freshLocations, mapReady, ticketsWithVerifiedPins]);

  useEffect(() => () => {
    for (const marker of markerRefs.current.values()) marker.setMap(null);
    markerRefs.current.clear();
  }, []);'''
source = source[:marker_start] + marker_effect + source[marker_end:]

for forbidden in [
    'const point = recordedTicketCoordinate(ticket);\n  const metadata = verificationMetadata(ticket);',
    'metadata.dispatchReady === true || ticket?.dispatchGeoReady === true',
    'markerRefs.current.forEach((marker) => marker.setMap(null))',
    'mapRef.current.setCenter(UAE_CENTRE)',
]:
    if forbidden in source:
        raise SystemExit(f'unsafe map marker remains: {forbidden}')
for required in [
    'const authoritativePinCandidate',
    'const markerRefs = useRef<Map<string, any>>(new Map())',
    'const hasAutoFittedViewportRef = useRef(false)',
    'const upsertMarker =',
    'if (!hasAutoFittedViewportRef.current && pointCount > 0)',
    'markerRefs.current.delete(key)',
]:
    if required not in source:
        raise SystemExit(f'required map control missing: {required}')
path.write_text(source, encoding='utf-8')
