import { addDoc, collection, db, doc, serverTimestamp, setDoc, updateDoc } from '../lib/firebase';

export type PropertyPassportInput = {
  ownerId: string;
  ownerEmail: string;
  propertyName: string;
  emirate?: string;
  address?: string;
  zone?: string;
  propertyType?: string;
  totalUnits?: number;
  floors?: number;
  areaSqft?: number;
  contractId?: string;
  systems?: Record<string, boolean> | string[];
  latitude?: number;
  longitude?: number;
};

export async function issuePropertyPassport(input: PropertyPassportInput) {
  const payload = {
    ...input,
    ownerEmail: input.ownerEmail.toLowerCase(),
    status: 'ACTIVE',
    activeContractId: input.contractId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, 'propertyPassports'), payload);

  if (input.contractId) {
    await updateDoc(doc(db, 'contracts', input.contractId), {
      propertyPassportId: ref.id,
      updatedAt: serverTimestamp(),
    });
  }

  await setDoc(doc(db, 'properties', ref.id), {
    ...payload,
    propertyPassportId: ref.id,
  }, { merge: true });

  return ref.id;
}

export async function linkPassportToOwner(userId: string, passportId: string, contractId?: string) {
  await updateDoc(doc(db, 'users', userId), {
    primaryPropertyPassportId: passportId,
    activeContractId: contractId || null,
    updatedAt: serverTimestamp(),
  });
}
