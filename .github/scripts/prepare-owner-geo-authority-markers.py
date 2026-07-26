from pathlib import Path

path = Path('apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx')
source = path.read_text(encoding='utf-8')

old_flags = """                verified: payload.verified ?? !isManual,
                requiresGeoReview: isManual ? true : Boolean(payload.requiresGeoReview),
                dispatchReady: isManual ? false : payload.dispatchReady ?? true
"""
normalized_flags = """                verified: payload.verified ?? !isManual,
                requiresGeoReview: payload.requiresGeoReview ?? isManual,
                dispatchReady: payload.dispatchReady ?? !isManual,
"""
if source.count(old_flags) != 1:
    raise SystemExit(f'legacy Owner geo flags: expected one marker, found {source.count(old_flags)}')
source = source.replace(old_flags, normalized_flags, 1)

old_location = """                location: { lat: geo.lat, lng: geo.lng }
"""
normalized_location = """                location: {
                    lat: geo.lat,
                    lng: geo.lng,
                    quality: geo.verified ? 'VERIFIED_EXACT_GPS' : 'REVIEW_REQUIRED',
                    source: geo.source,
                    verified: geo.verified,
                    dispatchReady: geo.dispatchReady,
                    requiresGeoReview: geo.requiresGeoReview,
                }
"""
if source.count(old_location) != 1:
    raise SystemExit(f'legacy Owner location marker: expected one marker, found {source.count(old_location)}')
source = source.replace(old_location, normalized_location, 1)
path.write_text(source, encoding='utf-8')
