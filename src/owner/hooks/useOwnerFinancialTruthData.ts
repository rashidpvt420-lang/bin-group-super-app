import { useEffect, useMemo, useState } from 'react';
import { collection, db, onSnapshot, query, where, limit } from '../../lib/firebase';
import { buildOwnerFinancialTruthSummary } from '../../../functions/shared/propertyPassportAggregation.mjs';
import { useOwnerPropertyPassports } from '../utils/useOwnerPropertyPassports';

type OwnerIdentity = { uid?: string | null; email?: string | null } | null | undefined;

type Row = { id: string; [key: string]: any };

const DEFAULT_MANAGEMENT_FEE_RATE = 0.05;

type OwnerFinancialTruthOptions = {
  feeRate?: number;
  /**
   * When a page already owns a UID-scoped invoice stream (OwnerFinancialsPage),
   * pass its rows here so the hook does not open a duplicate listener. The page
   * stays responsible for surfacing its own invoice stream failure.
   */
  invoices?: Row[] | null;
};

/**
 * Loads Owner-scoped passports, paid invoices, and properties, then builds the
 * shared Financial Truth summary used by the dashboard card and financials page.
 */
export function useOwnerFinancialTruthData(user: OwnerIdentity, options: OwnerFinancialTruthOptions = {}) {
  const feeRate = Number.isFinite(Number(options.feeRate)) ? Number(options.feeRate) : DEFAULT_MANAGEMENT_FEE_RATE;
  const externalInvoices = Array.isArray(options.invoices) ? options.invoices : null;
  const usesExternalInvoices = externalInvoices !== null;
  const { passports, loading: passportsLoading, error: passportError } = useOwnerPropertyPassports(user);
  const [invoices, setInvoices] = useState<Row[]>([]);
  const [properties, setProperties] = useState<Row[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [streamError, setStreamError] = useState('');

  const uid = String(user?.uid || '').trim();

  useEffect(() => {
    if (usesExternalInvoices) {
      setInvoicesLoading(false);
      return undefined;
    }
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
  }, [uid, usesExternalInvoices]);

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

  const effectiveInvoices = externalInvoices ?? invoices;

  const summary = useMemo(
    () => buildOwnerFinancialTruthSummary({
      passports,
      invoices: effectiveInvoices,
      properties,
      feeRate,
    }),
    [passports, effectiveInvoices, properties, feeRate],
  );

  return {
    passports,
    invoices: effectiveInvoices,
    properties,
    summary,
    loading: passportsLoading || (!usesExternalInvoices && invoicesLoading) || propertiesLoading,
    error: passportError || streamError,
    feeRate,
  };
}
