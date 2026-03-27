const { db } = require('../config/firebase');

/**
 * BIN-LIVE™ Production Telemetry Engine
 * High-velocity location orchestration for field teams.
 */

class LocationService {
    /**
     * Update Technician Location with Operational Rules
     */
    async updateLocation(data) {
        const { 
            technicianId, 
            lat, 
            lng, 
            batteryLevel, 
            speed = 0, 
            heading = 0, 
            status = 'ACTIVE',
            jobId = null
        } = data;

        if (!technicianId || !lat || !lng) {
            throw new Error("Invalid telemetry payload: Missing coordinates or ID");
        }

        const timestamp = Date.now();
        const techRef = db.collection('technicianLocations').doc(technicianId);

        // 🛡️ 1. SECURITY & SPOOFING CHECK
        // Get last known location to check for "Abnormal Jump"
        const lastSnap = await techRef.get();
        let riskFlag = false;
        
        if (lastSnap.exists) {
            const lastData = lastSnap.data();
            const distanceShift = this.calculateDistance(lat, lng, lastData.lat, lastData.lng);
            const timeDiff = (timestamp - lastData.timestamp) / 1000; // seconds
            
            // If tech "jumps" too far in short time (e.g. > 100km/h in Dubai traffic)
            if (timeDiff > 0 && (distanceShift / timeDiff) > 50) { // > 50 m/s ~ 180 km/h
                riskFlag = true;
                console.warn(`🚨 [BIN-LIVE] SPOOFING RISK: Technician ${technicianId} jumped ${distanceShift.toFixed(2)}m in ${timeDiff}s`);
            }
        }

        // 🔋 2. BATTERY AWARE THROTTLING (Placeholder for Client-side logic)
        // If battery < 20%, we recommend the client app to slow down updates.

        const telemetry = {
            technicianId,
            lat,
            lng,
            batteryLevel,
            speed,
            heading,
            status,
            jobId,
            timestamp,
            riskFlag,
            lastUpdate: new Date(timestamp).toLocaleTimeString(),
            isStale: false
        };

        // 🛰️ 3. WRITE TO TELEMETRY LEDGER
        await techRef.set(telemetry, { merge: true });

        // Also log to history for route analysis (Institutional Proof)
        await db.collection('telemetryHistory').add({
            ...telemetry,
            loggedAt: timestamp
        });

        return { success: true, riskFlag };
    }

    /**
     * Haversine distance calculator (meters)
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    /**
     * Mark Stale Signals
     * (Called by Cron or periodic task)
     */
    async cleanupStaleSignals() {
        const threshold = Date.now() - (5 * 60 * 1000); // 5 mins
        const staleSnap = await db.collection('technicianLocations')
            .where('timestamp', '<', threshold)
            .get();

        const batch = db.batch();
        staleSnap.forEach(doc => {
            batch.update(doc.ref, { isStale: true, status: 'OFFLINE' });
        });
        
        await batch.commit();
        return staleSnap.size;
    }
}

module.exports = new LocationService();
