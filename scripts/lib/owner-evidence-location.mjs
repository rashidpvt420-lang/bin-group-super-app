import { createHash } from 'node:crypto';

// Synthetic whole-building fixtures still obey the production five-decimal
// GEO_UNIT identity. Check existing claims rather than deleting historical proof.
export function ownerEvidenceLocation(seed, attempt = 0) {
  const hash = createHash('sha256').update(`${seed}:${attempt}`).digest('hex');
  const coordinateOffset = (start) => (Number.parseInt(hash.slice(start, start + 8), 16) % 8001 - 4000) / 1_000_000;
  return {
    latitude: Number((24.4958 + coordinateOffset(0)).toFixed(7)),
    longitude: Number((54.4074 + coordinateOffset(8)).toFixed(7)),
  };
}

export function ownerEvidenceGeoIdentity({ latitude, longitude }) {
  const raw = `geo|${latitude.toFixed(5)}|${longitude.toFixed(5)}|unit|whole-property|type|building`;
  return createHash('sha256').update(`PROPERTY_IDENTITY_V1\n${raw}`).digest('hex');
}

export async function selectUnusedOwnerEvidenceLocation(db, seed) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const location = ownerEvidenceLocation(seed, attempt);
    const [claim, existing] = await Promise.all([
      db.collection('property_identity_registry').doc(ownerEvidenceGeoIdentity(location)).get(),
      db.collection('properties').where('geo.lat', '==', location.latitude).limit(50).get(),
    ]);
    const legacyCollision = existing.docs.some((doc) => {
      const property = doc.data();
      const geo = property.submittedGeo || property.geo || property.location || {};
      const lat = Number(geo.lat ?? geo.latitude ?? geo.point?.latitude);
      const lng = Number(geo.lng ?? geo.longitude ?? geo.point?.longitude);
      const unit = property.unitNumber || property.unitNo || property.unit || property.unitId;
      return !unit && String(property.propertyType || property.type || property.subType).toLowerCase() === 'building'
        && Number.isFinite(lat) && Number.isFinite(lng)
        && lat.toFixed(5) === location.latitude.toFixed(5)
        && lng.toFixed(5) === location.longitude.toFixed(5);
    });
    if (!claim.exists && !legacyCollision) return location;
  }
  throw new Error('No unused synthetic Owner location found; production property claims were preserved.');
}
