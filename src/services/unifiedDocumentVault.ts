import { functions, httpsCallable } from '../lib/firebase';

export type UnifiedVaultArtifact = {
  artifactId: string;
  sourceCollection: string;
  sourceId: string;
  category: string;
  title: string;
  status: string;
  propertyId?: string | null;
  contractId?: string | null;
  paymentId?: string | null;
  storagePath?: string | null;
  fileName?: string | null;
  createdAt?: unknown;
};

export async function listUnifiedDocumentVault(): Promise<UnifiedVaultArtifact[]> {
  const call = httpsCallable(functions, 'listUnifiedDocumentVault');
  const response: any = await call({});
  return Array.isArray(response?.data?.artifacts) ? response.data.artifacts : [];
}

export async function getUnifiedDocumentFileUrl(artifactId: string): Promise<string> {
  const call = httpsCallable(functions, 'getUnifiedDocumentFile');
  const response: any = await call({ artifactId });
  const url = String(response?.data?.url || '').trim();
  if (!url) throw new Error('Authorized document URL was not returned.');
  return url;
}

export async function openUnifiedDocument(artifactId: string): Promise<void> {
  const url = await getUnifiedDocumentFileUrl(artifactId);
  window.open(url, '_blank', 'noopener,noreferrer');
}
