/**
 * Custom Hook: Real-time GPS Tracking
 * For technician live location updates
 */

import { useEffect, useState } from 'react';
import { db, doc, updateDoc, serverTimestamp } from '../lib/firebase';

export interface GPSLocation {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export function useGPS(technicianId: string, enabled = true) {
  const [location, setLocation] = useState<GPSLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !technicianId) return;

    let watchId: number | null = null;

    const startTracking = async () => {
      try {
        if (!navigator.geolocation) {
          throw new Error('Geolocation not supported');
        }

        watchId = navigator.geolocation.watchPosition(
          async (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            const gpsData: GPSLocation = {
              lat: latitude,
              lng: longitude,
              accuracy: accuracy,
              timestamp: Date.now()
            };

            setLocation(gpsData);
            setError(null);
            setLoading(false);

            // Update Firestore with current location
            try {
              const locRef = doc(db, `technicians/${technicianId}/liveLocation/current`);
              await updateDoc(locRef, {
                lat: latitude,
                lng: longitude,
                accuracy: accuracy,
                updatedAt: serverTimestamp()
              });
            } catch (firestoreError) {
              console.error('[GPS] Firestore update failed:', firestoreError);
            }
          },
          (geoError) => {
            setError(geoError.message);
            setLoading(false);
          },
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
          }
        );
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    startTracking();

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [technicianId, enabled]);

  return { location, error, loading };
}
