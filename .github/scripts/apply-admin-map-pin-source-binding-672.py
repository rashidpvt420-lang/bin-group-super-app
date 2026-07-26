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
for forbidden in [
    'const point = recordedTicketCoordinate(ticket);\n  const metadata = verificationMetadata(ticket);',
    'metadata.dispatchReady === true || ticket?.dispatchGeoReady === true',
]:
    if forbidden in source:
        raise SystemExit(f'unsafe pin-source marker remains: {forbidden}')
path.write_text(source, encoding='utf-8')
