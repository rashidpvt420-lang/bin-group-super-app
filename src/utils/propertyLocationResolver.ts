export interface ResolvedPropertyLocation {
  latitude: number | null;
  longitude: number | null;
  hasExactCoordinates: boolean;
  address: string;
  emirate: string;
  googleMapsUrl: string;
  embedQuery: string;
  locationQuality: "EXACT_GPS" | "PLUS_CODE" | "MAP_URL" | "ADDRESS_ONLY" | "MISSING";
  warning: string | null;
}

export function resolvePropertyLocation(record: any): ResolvedPropertyLocation {
  const getVal = (val: any): number | null => {
    if (val === undefined || val === null || val === '') return null;
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : null;
  };

  let latitude: number | null = null;
  let longitude: number | null = null;

  if (record) {
    // 1. Direct fields
    if (latitude === null) latitude = getVal(record.latitude);
    if (latitude === null) latitude = getVal(record.lat);

    if (longitude === null) longitude = getVal(record.longitude);
    if (longitude === null) longitude = getVal(record.lng);

    // 2. record.location?.lat/lng/latitude/longitude
    if (latitude === null) latitude = getVal(record.location?.latitude);
    if (latitude === null) latitude = getVal(record.location?.lat);

    if (longitude === null) longitude = getVal(record.location?.longitude);
    if (longitude === null) longitude = getVal(record.location?.lng);

    // 3. record.coordinates?.lat/lng
    if (latitude === null) latitude = getVal(record.coordinates?.latitude);
    if (latitude === null) latitude = getVal(record.coordinates?.lat);

    if (longitude === null) longitude = getVal(record.coordinates?.longitude);
    if (longitude === null) longitude = getVal(record.coordinates?.lng);

    // 4. record.geo?.lat/lng
    if (latitude === null) latitude = getVal(record.geo?.latitude);
    if (latitude === null) latitude = getVal(record.geo?.lat);

    if (longitude === null) longitude = getVal(record.geo?.longitude);
    if (longitude === null) longitude = getVal(record.geo?.lng);

    // 5. record.geoPoint?.latitude/longitude
    if (latitude === null) latitude = getVal(record.geoPoint?.latitude);
    if (latitude === null) latitude = getVal(record.geoPoint?.lat);

    if (longitude === null) longitude = getVal(record.geoPoint?.longitude);
    if (longitude === null) longitude = getVal(record.geoPoint?.lng);

    // 6. record.map?.lat/lng
    if (latitude === null) latitude = getVal(record.map?.latitude);
    if (latitude === null) latitude = getVal(record.map?.lat);

    if (longitude === null) longitude = getVal(record.map?.longitude);
    if (longitude === null) longitude = getVal(record.map?.lng);

    // 7. record.propertyLocation?.lat/lng
    if (latitude === null) latitude = getVal(record.propertyLocation?.latitude);
    if (latitude === null) latitude = getVal(record.propertyLocation?.lat);

    if (longitude === null) longitude = getVal(record.propertyLocation?.longitude);
    if (longitude === null) longitude = getVal(record.propertyLocation?.lng);
  }

  const hasExactCoordinates = latitude !== null && longitude !== null;

  // Resolve address & emirate
  const address = record?.address || record?.addressLine || record?.locationText || record?.location?.address || record?.geo?.address || record?.location || '';
  const emirate = record?.emirate || record?.location?.emirate || record?.geo?.emirate || record?.city || 'UAE';

  // Support for urls and plusCode
  const googleMapsUrlField = record?.googleMapsUrl || record?.mapUrl || record?.locationUrl || record?.location?.googleMapsUrl || '';
  const plusCodeField = record?.plusCode || record?.googlePlusCode || record?.location?.plusCode || '';

  // Determine location quality
  let locationQuality: "EXACT_GPS" | "PLUS_CODE" | "MAP_URL" | "ADDRESS_ONLY" | "MISSING" = "MISSING";

  if (hasExactCoordinates) {
    locationQuality = "EXACT_GPS";
  } else if (plusCodeField) {
    locationQuality = "PLUS_CODE";
  } else if (googleMapsUrlField) {
    locationQuality = "MAP_URL";
  } else if (address) {
    locationQuality = "ADDRESS_ONLY";
  } else {
    locationQuality = "MISSING";
  }

  // Determine googleMapsUrl
  let googleMapsUrl = googleMapsUrlField;
  if (!googleMapsUrl) {
    if (hasExactCoordinates) {
      googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    } else if (plusCodeField) {
      googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plusCodeField)}`;
    } else if (address) {
      googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([address, emirate, 'United Arab Emirates'].filter(Boolean).join(', '))}`;
    } else {
      googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([emirate, 'United Arab Emirates'].filter(Boolean).join(', '))}`;
    }
  }

  // Determine embedQuery
  let embedQuery = '';
  if (hasExactCoordinates) {
    embedQuery = `${latitude},${longitude}`;
  } else if (plusCodeField) {
    embedQuery = plusCodeField;
  } else if (address) {
    embedQuery = [address, emirate, 'United Arab Emirates'].filter(Boolean).join(', ');
  } else {
    embedQuery = [emirate, 'United Arab Emirates'].filter(Boolean).join(', ');
  }

  // Determine warning
  let warning: string | null = null;
  if (!hasExactCoordinates) {
    if (locationQuality === "MISSING") {
      warning = "Property location information is completely missing.";
    } else {
      warning = "Exact GPS pin is not saved yet. This map is using address-level lookup only.";
    }
  }

  return {
    latitude,
    longitude,
    hasExactCoordinates,
    address,
    emirate,
    googleMapsUrl,
    embedQuery,
    locationQuality,
    warning
  };
}
