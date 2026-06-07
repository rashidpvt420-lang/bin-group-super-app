/**
 * Custom Hook: Real-Time Data Subscription
 * Simplifies real-time data binding in components
 */

import { useEffect, useState } from 'react';
import { realtimeService } from '../lib/firebaseRealtimeService';

export function useOwnerProperties(ownerId: string) {
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ownerId) return;

    setLoading(true);
    const unsubscribe = realtimeService.subscribeToOwnerProperties(
      ownerId,
      (data) => {
        if (data && !data.error) {
          setProperties(Array.isArray(data) ? data : []);
          setError(null);
        } else {
          setError(data?.error || 'Unknown error');
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [ownerId]);

  return { properties, loading, error };
}

export function useTenantTickets(tenantId: string) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    setLoading(true);
    const unsubscribe = realtimeService.subscribeToTenantTickets(
      tenantId,
      (data) => {
        if (data && !data.error) {
          setTickets(Array.isArray(data) ? data : []);
          setError(null);
        } else {
          setError(data?.error || 'Unknown error');
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [tenantId]);

  return { tickets, loading, error };
}

export function useTechnicianTickets(technicianId: string) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!technicianId) return;

    setLoading(true);
    const unsubscribe = realtimeService.subscribeTechnicianTickets(
      technicianId,
      (data) => {
        if (data && !data.error) {
          setTickets(Array.isArray(data) ? data : []);
          setError(null);
        } else {
          setError(data?.error || 'Unknown error');
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [technicianId]);

  return { tickets, loading, error };
}

export function useBrokerReferrals(brokerId: string) {
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!brokerId) return;

    setLoading(true);
    const unsubscribe = realtimeService.subscribeToBrokerReferrals(
      brokerId,
      (data) => {
        if (data && !data.error) {
          setReferrals(Array.isArray(data) ? data : []);
          setError(null);
        } else {
          setError(data?.error || 'Unknown error');
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [brokerId]);

  return { referrals, loading, error };
}

export function useTechnicianLocation(technicianId: string) {
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!technicianId) return;

    setLoading(true);
    const unsubscribe = realtimeService.subscribeToTechnicianLocation(
      technicianId,
      (data) => {
        if (data && !data.error) {
          setLocation(data);
          setError(null);
        } else {
          setError(data?.error || 'Unknown error');
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [technicianId]);

  return { location, loading, error };
}
