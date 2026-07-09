import React from 'react';
import { addDoc, collection, db, limit, onSnapshot, query, serverTimestamp, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';

type BrokerAttributionSignals = {
  loading: boolean;
  referralLinkReady: boolean;
  qrReady: boolean;
  activeLeads: number;
  attributedContracts: number;
  pendingCommissionAmount: number;
  referralCode: string;
  referralUrl: string;
  createAttributionLead: (input: { ownerName: string; ownerEmail?: string; ownerPhone?: string; propertyName?: string; notes?: string }) => Promise<string>;
};

const brokerKey = (uid?: string, email?: string | null) => {
  const base = (uid || email || 'broker').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase();
  return `BIN-${base || 'BROKER'}`;
};

const moneyValue = (value: unknown) => Number(value || 0) || 0;

export function useBrokerAttributionSignals(): BrokerAttributionSignals {
  const { user } = useRole();
  const [loading, setLoading] = React.useState(true);
  const [activeLeads, setActiveLeads] = React.useState(0);
  const [attributedContracts, setAttributedContracts] = React.useState(0);
  const [pendingCommissionAmount, setPendingCommissionAmount] = React.useState(0);

  const referralCode = React.useMemo(() => brokerKey(user?.uid, user?.email), [user?.uid, user?.email]);
  const referralUrl = React.useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://bin-group-57c60.web.app';
    return `${origin}/owner/onboarding?broker=${encodeURIComponent(referralCode)}`;
  }, [referralCode]);

  React.useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return undefined;
    }

    const unsubs: Array<() => void> = [];
    const publishLoaded = () => setLoading(false);

    unsubs.push(onSnapshot(query(collection(db, 'brokerLeads'), where('brokerId', '==', user.uid), limit(100)), (snap) => {
      setActiveLeads(snap.docs.filter((docSnap) => !String(docSnap.data()?.status || '').toUpperCase().includes('CLOSED')).length);
      publishLoaded();
    }, (err) => {
      console.warn('[BrokerAttributionSignals] brokerLeads listener failed:', err);
      setActiveLeads(0);
      publishLoaded();
    }));

    unsubs.push(onSnapshot(query(collection(db, 'broker_commissions'), where('brokerId', '==', user.uid), limit(100)), (snap) => {
      let contractCount = 0;
      let pendingAmount = 0;
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.contractId || data.sourceContractId) contractCount += 1;
        const status = String(data.status || '').toUpperCase();
        if (!status.includes('PAID') && !status.includes('REJECTED')) {
          pendingAmount += moneyValue(data.amount || data.commissionAmount);
        }
      });
      setAttributedContracts(contractCount);
      setPendingCommissionAmount(pendingAmount);
      publishLoaded();
    }, (err) => {
      console.warn('[BrokerAttributionSignals] broker_commissions listener failed:', err);
      setAttributedContracts(0);
      setPendingCommissionAmount(0);
      publishLoaded();
    }));

    return () => unsubs.forEach((unsub) => unsub());
  }, [user?.uid]);

  const createAttributionLead = React.useCallback(async (input: { ownerName: string; ownerEmail?: string; ownerPhone?: string; propertyName?: string; notes?: string }) => {
    if (!user?.uid) throw new Error('Broker login is required.');
    const ownerName = input.ownerName.trim();
    if (!ownerName) throw new Error('Owner name is required.');

    const docRef = await addDoc(collection(db, 'brokerLeads'), {
      brokerId: user.uid,
      brokerUid: user.uid,
      brokerEmail: user.email || '',
      brokerName: user.displayName || 'BIN Broker',
      attributionId: `${referralCode}-${Date.now()}`,
      referralCode,
      referralUrl,
      leadName: ownerName,
      ownerName,
      ownerEmail: input.ownerEmail || '',
      ownerPhone: input.ownerPhone || '',
      propertyName: input.propertyName || '',
      notes: input.notes || '',
      status: 'SUBMITTED',
      source: 'BROKER_SIMPLE_MODE',
      attributionLocked: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return docRef.id;
  }, [referralCode, referralUrl, user?.displayName, user?.email, user?.uid]);

  return {
    loading,
    referralLinkReady: Boolean(referralCode),
    qrReady: Boolean(referralUrl),
    activeLeads,
    attributedContracts,
    pendingCommissionAmount,
    referralCode,
    referralUrl,
    createAttributionLead,
  };
}
