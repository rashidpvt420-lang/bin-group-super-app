import { useEffect, useState } from 'react';
import { collection, db, onSnapshot, query, where } from '../../lib/firebase';
import { mergePassportRecords } from '../../../functions/shared/propertyPassportAggregation.mjs';

type OwnerIdentity = { uid?: string | null; email?: string | null } | null | undefined;

type PassportRow = { id: string; [key: string]: any };

/**
 * Owner financial pages must see passports addressed by ownerId or ownerEmail.
 * A single ownerEmail query hides records the passport sync stored under ownerId.
 */
export function useOwnerPropertyPassports(user: OwnerIdentity) {
  const [passports, setPassports] = useState<PassportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const uid = String(user?.uid || '').trim();
  const email = String(user?.email || '').trim().toLowerCase();

  useEffect(() => {
    const specs: Array<{ key: string; field: 'ownerEmail' | 'ownerId'; value: string }> = [];
    if (email) specs.push({ key: 'ownerEmail', field: 'ownerEmail', value: email });
    if (uid) specs.push({ key: 'ownerId', field: 'ownerId', value: uid });

    if (!specs.length) {
      setPassports([]);
      setError('Authenticated Owner identity is unavailable. Reload the portal and try again.');
      setLoading(false);
      return undefined;
    }

    const buckets = new Map<string, PassportRow[]>();
    const failures: string[] = [];
    const seen = new Set<string>();
    let pending = specs.length;

    const publish = () => {
      setPassports(mergePassportRecords(specs.map((spec) => buckets.get(spec.key) || [])));
      setError(failures.length === specs.length ? failures[0] : '');
      if (pending === 0) setLoading(false);
    };

    const unsubscribers = specs.map((spec) => onSnapshot(
      query(collection(db, 'propertyPassports'), where(spec.field, '==', spec.value)),
      (snapshot) => {
        buckets.set(spec.key, snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        if (!seen.has(spec.key)) {
          seen.add(spec.key);
          pending -= 1;
        }
        publish();
      },
      (snapshotError) => {
        console.error(`[owner-passports] ${spec.key} listener failed:`, snapshotError);
        buckets.set(spec.key, []);
        failures.push('Property financial records could not be loaded.');
        if (!seen.has(spec.key)) {
          seen.add(spec.key);
          pending -= 1;
        }
        publish();
      },
    ));

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [uid, email]);

  return { passports, loading, error };
}
