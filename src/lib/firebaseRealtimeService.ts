/**
 * Enhanced Firebase Real-Time Service
 * BIN GROUP - Active Data Synchronization Layer
 * Provides bidirectional real-time updates for all dashboards
 */

import { db, collection, query, where, orderBy, limit, onSnapshot } from './firebase';
import type { Unsubscribe } from './firebase';

type RealtimeErrorPayload = { error: string };
type RealtimeListPayload<T = any> = T[] | RealtimeErrorPayload;
type RealtimePayload<T = any> = T | RealtimeErrorPayload;

const MAINTENANCE_TICKETS_COLLECTION = 'maintenanceTickets';

interface RealtimeSubscription {
  unsubscribe: Unsubscribe;
  ref: string;
}

class FirebaseRealtimeService {
  private subscriptions = new Map<string, RealtimeSubscription>();
  private listeners = new Map<string, Set<(data: any) => void>>();

  /**
   * OWNER DASHBOARD: Real-time property & tenant updates
   */
  subscribeToOwnerProperties(ownerId: string, callback: (data: RealtimeListPayload) => void): () => void {
    const ref = `owner_properties_${ownerId}`;
    this.addListener(ref, callback);

    const q = query(
      collection(db, 'properties'),
      where('ownerId', '==', ownerId),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const properties = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        lastSync: new Date().toISOString()
      }));
      this.notifyListeners(ref, properties);
    }, (error) => {
      console.error('[Real-Time] Owner properties subscription failed:', error);
      this.notifyListeners(ref, { error: error.message });
    });

    this.subscriptions.set(ref, { unsubscribe: unsub, ref });
    return () => this.unsubscribe(ref);
  }

  /**
   * TENANT DASHBOARD: Real-time tickets & maintenance requests
   */
  subscribeToTenantTickets(tenantId: string, callback: (data: RealtimeListPayload) => void): () => void {
    const ref = `tenant_tickets_${tenantId}`;
    this.addListener(ref, callback);

    const q = query(
      collection(db, MAINTENANCE_TICKETS_COLLECTION),
      where('tenantId', '==', tenantId),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(q, (snap) => {
      const tickets = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        statusHistory: doc.data().statusHistory || [],
        lastSync: new Date().toISOString()
      }));
      this.notifyListeners(ref, tickets);
    }, (error) => {
      console.error('[Real-Time] Tenant maintenanceTickets subscription failed:', error);
      this.notifyListeners(ref, { error: error.message });
    });

    this.subscriptions.set(ref, { unsubscribe: unsub, ref });
    return () => this.unsubscribe(ref);
  }

  /**
   * TECHNICIAN DASHBOARD: Real-time GPS & ticket assignments
   */
  subscribeToTechnicianTickets(technicianId: string, callback: (data: RealtimeListPayload) => void): () => void {
    const ref = `technician_tickets_${technicianId}`;
    this.addListener(ref, callback);

    const q = query(
      collection(db, MAINTENANCE_TICKETS_COLLECTION),
      where('assignedTechnicianId', '==', technicianId),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(q, (snap) => {
      const tickets = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        location: doc.data().location || doc.data().jobLocation || doc.data().propertyLocation || {},
        lastSync: new Date().toISOString()
      }));
      this.notifyListeners(ref, tickets);
    }, (error) => {
      console.error('[Real-Time] Technician maintenanceTickets subscription failed:', error);
      this.notifyListeners(ref, { error: error.message });
    });

    this.subscriptions.set(ref, { unsubscribe: unsub, ref });
    return () => this.unsubscribe(ref);
  }

  /**
   * BROKER DASHBOARD: Real-time referrals & commissions
   */
  subscribeToBrokerReferrals(brokerId: string, callback: (data: RealtimeListPayload) => void): () => void {
    const ref = `broker_referrals_${brokerId}`;
    this.addListener(ref, callback);

    const q = query(
      collection(db, 'referrals'),
      where('brokerId', '==', brokerId),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const referrals = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        commission: doc.data().commission || 0,
        status: doc.data().status || 'pending',
        lastSync: new Date().toISOString()
      }));
      this.notifyListeners(ref, referrals);
    }, (error) => {
      console.error('[Real-Time] Broker referrals subscription failed:', error);
      this.notifyListeners(ref, { error: error.message });
    });

    this.subscriptions.set(ref, { unsubscribe: unsub, ref });
    return () => this.unsubscribe(ref);
  }

  /**
   * ADMIN DASHBOARD: Global system metrics & user activity
   */
  subscribeToAdminMetrics(callback: (data: RealtimePayload) => void): () => void {
    const ref = 'admin_system_metrics';
    this.addListener(ref, callback);

    const unsub = onSnapshot(
      collection(db, 'systemMetrics'),
      (snap) => {
        const metrics = snap.docs[snap.docs.length - 1]?.data() || {};
        this.notifyListeners(ref, { ...metrics, timestamp: new Date().toISOString() });
      },
      (error) => {
        console.error('[Real-Time] Admin metrics subscription failed:', error);
        this.notifyListeners(ref, { error: error.message });
      }
    );

    this.subscriptions.set(ref, { unsubscribe: unsub, ref });
    return () => this.unsubscribe(ref);
  }

  /**
   * TECHNICIAN GPS: Real-time location tracking
   */
  subscribeToTechnicianLocation(technicianId: string, callback: (data: RealtimePayload) => void): () => void {
    const ref = `technician_location_${technicianId}`;
    this.addListener(ref, callback);

    const unsub = onSnapshot(
      collection(db, `technicians/${technicianId}/liveLocation`),
      (snap) => {
        const location = snap.docs[snap.docs.length - 1]?.data() || {};
        this.notifyListeners(ref, {
          ...location,
          timestamp: new Date().toISOString()
        });
      },
      (error) => {
        console.error('[Real-Time] Technician location subscription failed:', error);
        this.notifyListeners(ref, { error: error.message });
      }
    );

    this.subscriptions.set(ref, { unsubscribe: unsub, ref });
    return () => this.unsubscribe(ref);
  }

  private addListener(ref: string, callback: (data: any) {
    if (!this.listeners.has(ref)) {
      this.listeners.set(ref, new Set());
    }
    this.listeners.get(ref)!.add(callback);
  }

  private notifyListeners(ref: string, data: any) {
    const listeners = this.listeners.get(ref);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('[Real-Time] Listener callback error:', error);
        }
      });
    }
  }

  private unsubscribe(ref: string) {
    const subscription = this.subscriptions.get(ref);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(ref);
      this.listeners.delete(ref);
    }
  }

  unsubscribeAll() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions.clear();
    this.listeners.clear();
  }
}

export const realtimeService = new FirebaseRealtimeService();
export default realtimeService;
