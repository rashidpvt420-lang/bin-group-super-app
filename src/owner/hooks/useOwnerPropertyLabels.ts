import { useEffect, useMemo, useState } from 'react';
import { collection, db, onSnapshot, query, where } from '../../lib/firebase';
import {
  replaceRawPropertyIds,
  resolvePropertyDisplayName,
  resolveTicketPropertyDisplayName,
} from '../../../functions/shared/propertyDisplayName';

type PropertyRow = Record<string, any> & { id: string };

/**
 * Owner-scoped property records keyed by document ID, plus readable labels.
 * Owner tickets/notifications reference properties by ID (and older tickets
 * stored that raw ID as propertyName); this resolves the human name/address
 * from the property record so the raw document ID is never shown.
 */
export function useOwnerPropertyLabels(ownerUid?: string | null) {
  const [propertiesById, setPropertiesById] = useState<Record<string, PropertyRow>>({});

  useEffect(() => {
    if (!ownerUid) {
      setPropertiesById({});
      return undefined;
    }
    const propertyQuery = query(collection(db, 'properties'), where('ownerId', '==', ownerUid));
    const unsubscribe = onSnapshot(
      propertyQuery,
      (snapshot) => {
        const next: Record<string, PropertyRow> = {};
        snapshot.docs.forEach((docSnap) => {
          next[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        setPropertiesById(next);
      },
      (error) => {
        // Labels degrade to the ticket's readable snapshot/address; never block the page.
        console.warn('[useOwnerPropertyLabels] property labels unavailable.', error?.code || error);
        setPropertiesById({});
      },
    );
    return () => unsubscribe();
  }, [ownerUid]);

  const labelsById = useMemo(() => {
    const labels: Record<string, string> = {};
    Object.entries(propertiesById).forEach(([id, property]) => {
      labels[id] = resolvePropertyDisplayName(property, { propertyId: id });
    });
    return labels;
  }, [propertiesById]);

  const ticketPropertyLabel = useMemo(
    () => (ticket: any, fallback?: string) =>
      resolveTicketPropertyDisplayName(ticket, propertiesById[String(ticket?.propertyId || '')] || null, fallback),
    [propertiesById],
  );

  const formatPropertyText = useMemo(
    () => (text: unknown) => replaceRawPropertyIds(text, labelsById),
    [labelsById],
  );

  return { propertiesById, labelsById, ticketPropertyLabel, formatPropertyText };
}
