import { useEffect, useMemo, useState } from 'react';
import { collection, db, onSnapshot, query, where, limit } from '../../lib/firebase';
import { buildOwnerFinancialTruthSummary } from '../../../functions/shared/propertyPassportAggregation.mjs';
import { useOwnerPropertyPassports } from '../utils/useOwnerPropertyPassports';

type OwnerIdentity = { uid?: string | null; email?: string | null } | null | undefined;

type Row = { id: string; [key: string]: any };

const MANAGEMENT_FEE_RATE = 0.05;

/**
 * Loads Owner-scoped passports, paid invoices, and properties, then builds the
 * shared Financial Truth summary used by the dashboard card and financials page.
 */
export function useOwnerFinancialTruthData(user: OwnerIdentity) {
  const { passports, loading: passportsLoading, error: passportError } = useOwnerPropertyPassports(user);
  const [invoices, setInvoices] = useState<Row[]>([]);
  const [properties, setProperties] = useState<Row[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [streamError, setStreamError] = useState('');

  const uid = String(user?.uid || '').trim();

  useEffect(() => {
    if (!uid) {
      setInvoices([]);
      setInvoicesLoading(false);
      setStreamError((prev) => prev || 'Authenticated Owner identity is unavailable. Reload the portal and try again.');
      return undefined;
    }

    setInvoicesLoading(true);
    const invoiceQ = query(collection(db, 'invoices'), where('ownerUid', '==', uid), limit(40));
    return onSnapshot(
      invoiceQ,
      (snap) => {
        setInvoices(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setInvoicesLoading(false);
      },
      (error) => {
        console.error('[owner-financial-truth] invoice listener failed:', error);
        setInvoices([]);
        setStreamError('Owner invoices could not be loaded. Paid-invoice totals may be incomplete.');
        setInvoicesLoading(false);
      },
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setProperties([]);
      setPropertiesLoading(false);
      return undefined;
    }

    setPropertiesLoading(true);
    const propertyQ = query(collection(db, 'properties'), where('ownerId', '==', uid));
    return onSnapshot(
      propertyQ,
      (snap) => {
        setProperties(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        setPropertiesLoading(false);
      },
      (error) => {
        console.error('[owner-financial-truth] property listener failed:', error);
        setProperties([]);
        setStreamError((prev) => prev || 'Owner properties could not be loaded. VERIFIED NOI may be unavailable.');
        setPropertiesLoading(false);
      },
    );
  }, [uid]);

  const summary = useMemo(
    () => buildOwnerFinancialTruthSummary({
      passports,
      invoices,
      properties,
      feeRate: MANAGEMENT_FEE_RATE,
    }),
    [passports, invoices, properties],
  );

  return {
    passports,
    invoices,
    properties,
    summary,
    loading: passportsLoading || invoicesLoading || propertiesLoading,
    error: passportError || streamError,
    MANAGEMENT_FEE_RATE,
  };
}
