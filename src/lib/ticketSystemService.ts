import {
  collection,
  db,
  doc,
  functions,
  getDocs,
  httpsCallable,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from './firebase';

const CANONICAL_TICKET_COLLECTION = 'maintenanceTickets';
const LEGACY_TICKET_COLLECTION = 'tickets';

export interface Ticket {
  id?: string;
  tenantId: string;
  tenantUid?: string;
  propertyId: string;
  unitId: string;
  title: string;
  description: string;
  category: 'maintenance' | 'repair' | 'plumbing' | 'electrical' | 'hvac' | 'emergency';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: string;
  assignedTechnicianId?: string;
  location?: { lat: number; lng: number; address: string };
  photos?: Array<{ url: string; timestamp: string; description?: string }>;
  estimatedCost?: number;
  actualCost?: number;
  completionNotes?: string;
  tenantApproval?: boolean;
  tenantRating?: number;
  createdAt?: any;
  updatedAt?: any;
  assignedAt?: any;
  completedAt?: any;
  statusHistory?: Array<{ status: string; timestamp?: any; timestampIso?: string; notes?: string }>;
  sourceCollection?: typeof CANONICAL_TICKET_COLLECTION | typeof LEGACY_TICKET_COLLECTION;
  legacyReadOnly?: boolean;
}

type TicketQuerySnapshot = {
  docs: Array<{ id: string; data: () => Record<string, unknown> }>;
};

function timestampMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === 'function') {
      const parsed = Number(toMillis.call(value));
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }
  if (value && typeof value === 'object' && 'seconds' in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    return Number.isFinite(seconds) ? seconds * 1000 : 0;
  }
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function secureClientRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ticket_service_${crypto.randomUUID()}`;
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `ticket_service_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
  }
  throw new Error('Secure browser randomness is required to create a maintenance ticket.');
}

function callablePriority(priority: Ticket['priority']) {
  if (priority === 'urgent' || priority === 'high') return 'urgent';
  return 'normal';
}

function mapSnapshot(
  snapshot: TicketQuerySnapshot,
  sourceCollection: typeof CANONICAL_TICKET_COLLECTION | typeof LEGACY_TICKET_COLLECTION,
): Ticket[] {
  return snapshot.docs.map((snapshotDocument) => ({
    id: snapshotDocument.id,
    ...snapshotDocument.data(),
    sourceCollection,
    legacyReadOnly: sourceCollection === LEGACY_TICKET_COLLECTION,
  } as Ticket));
}

function mergeCanonicalWithLegacy(canonical: Ticket[], legacy: Ticket[]): Ticket[] {
  const records = new Map<string, Ticket>();
  canonical.forEach((ticket) => {
    if (ticket.id) records.set(ticket.id, ticket);
  });
  legacy.forEach((ticket) => {
    if (ticket.id && !records.has(ticket.id)) records.set(ticket.id, ticket);
  });
  return [...records.values()].sort((left, right) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt));
}

async function queryTickets(
  collectionName: typeof CANONICAL_TICKET_COLLECTION | typeof LEGACY_TICKET_COLLECTION,
  fieldNames: string[],
  value: string,
): Promise<Ticket[]> {
  const snapshots = await Promise.all(
    fieldNames.map((fieldName) => getDocs(query(collection(db, collectionName), where(fieldName, '==', value)))),
  );
  return snapshots.flatMap((snapshot) => mapSnapshot(snapshot, collectionName));
}

async function readLegacyTickets(fieldNames: string[], value: string): Promise<Ticket[]> {
  try {
    return await queryTickets(LEGACY_TICKET_COLLECTION, fieldNames, value);
  } catch (error) {
    console.warn('[Ticket System] Legacy read-only compatibility lookup failed:', error);
    return [];
  }
}

class TicketSystemService {
  /** Create through the App Check-protected server authority only. */
  async createTicket(
    tenantId: string,
    ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<string> {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) throw new Error('Tenant ID is required.');
    if (!ticket.unitId || !ticket.propertyId) throw new Error('Property and unit are required.');

    const description = String(ticket.description || ticket.title || '').trim();
    if (description.length < 8) throw new Error('A meaningful maintenance description is required.');

    const createTenantServiceTicket = httpsCallable(functions, 'createTenantServiceTicket');
    const response: any = await createTenantServiceTicket({
      kind: 'AI_CONCIERGE',
      unitId: ticket.unitId,
      propertyId: ticket.propertyId,
      clientRequestId: secureClientRequestId(),
      details: {
        category: ticket.category,
        priority: callablePriority(ticket.priority),
        description,
        specificLocation: String(ticket.location?.address || ticket.title || '').trim(),
        photoEvidenceExpected: true,
      },
    });
    const ticketId = String(response?.data?.ticketId || '').trim();
    if (!ticketId) throw new Error('The server did not return a canonical ticket ID.');

    const photoUrls = (ticket.photos || []).map((photo) => String(photo.url || '').trim()).filter(Boolean);
    if (photoUrls.length > 0) {
      await updateDoc(doc(db, CANONICAL_TICKET_COLLECTION, ticketId), {
        photos: photoUrls,
        primaryPhotoUrl: photoUrls[0],
        evidenceStatus: 'TENANT_EVIDENCE_UPLOADED',
        evidenceUploadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    console.info('[Ticket System] Canonical ticket created through protected callable:', ticketId);
    return ticketId;
  }

  /** Assignment is server-authoritative and audited by adminAssignTechnician. */
  async assignTicket(ticketId: string, technicianId: string, notes?: string): Promise<void> {
    const assignTechnician = httpsCallable(functions, 'adminAssignTechnician');
    await assignTechnician({
      ticketId,
      technicianId,
      ...(notes?.trim() ? { notes: notes.trim() } : {}),
    });
    console.info('[Ticket System] Canonical ticket assigned:', ticketId, technicianId);
  }

  /** Technician lifecycle state is changed only through the protected callable. */
  async startTicket(ticketId: string, technicianId: string): Promise<void> {
    const updateTicketLifecycle = httpsCallable(functions, 'updateTicketLifecycle');
    await updateTicketLifecycle({
      ticketId,
      status: 'IN_PROGRESS',
      notes: `Work started by Technician ${technicianId}.`,
    });
    console.info('[Ticket System] Canonical ticket started:', ticketId, technicianId);
  }

  async completeTicket(
    ticketId: string,
    technicianId: string,
    data: { photos?: Array<{ url: string; description?: string }>; notes?: string; actualCost?: number },
  ): Promise<void> {
    const photoUrls = (data.photos || []).map((photo) => String(photo.url || '').trim()).filter(Boolean);
    const proofUpdate: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (data.notes?.trim()) {
      proofUpdate.completionNotes = data.notes.trim();
      proofUpdate.technicianNotes = data.notes.trim();
    }
    if (photoUrls.length > 0) {
      proofUpdate.proofPhotos = photoUrls;
      proofUpdate.completionPhotos = photoUrls;
      proofUpdate.afterPhotos = photoUrls;
      proofUpdate.afterPhotoUrl = photoUrls[0];
    }
    if (Object.keys(proofUpdate).length > 1) {
      await updateDoc(doc(db, CANONICAL_TICKET_COLLECTION, ticketId), proofUpdate);
    }

    const updateTicketLifecycle = httpsCallable(functions, 'updateTicketLifecycle');
    await updateTicketLifecycle({
      ticketId,
      status: 'COMPLETED',
      notes: data.notes?.trim() || `Work completed by Technician ${technicianId}.`,
      ...(Number.isFinite(data.actualCost) ? { actualCost: Number(data.actualCost) } : {}),
    });
    console.info('[Ticket System] Canonical ticket completed:', ticketId, technicianId);
  }

  /** Tenant approval/dispute is server-authoritative and participant-bound. */
  async approveTicket(ticketId: string, tenantId: string, approved: boolean, rating?: number): Promise<void> {
    const tenantReviewTicketCompletion = httpsCallable(functions, 'tenantReviewTicketCompletion');
    if (approved) {
      const safeRating = Math.max(1, Math.min(5, Number(rating || 5)));
      await tenantReviewTicketCompletion({
        ticketId,
        action: 'approve',
        rating: safeRating,
        feedback: 'Approved by tenant through the canonical ticket service.',
      });
    } else {
      await tenantReviewTicketCompletion({
        ticketId,
        action: 'dispute',
        disputeReason: 'Tenant rejected the completed work through the canonical ticket service.',
      });
    }
    console.info('[Ticket System] Canonical tenant review submitted:', ticketId, tenantId, approved);
  }

  /** Canonical records win; unmatched legacy rows remain visible as read-only history. */
  async getTenantTickets(tenantId: string): Promise<Ticket[]> {
    const canonical = await queryTickets(
      CANONICAL_TICKET_COLLECTION,
      ['tenantId', 'tenantUid', 'userId', 'createdByUid'],
      tenantId,
    );
    const legacy = await readLegacyTickets(['tenantId', 'tenantUid', 'userId'], tenantId);
    return mergeCanonicalWithLegacy(canonical, legacy);
  }

  /** Canonical records win; unmatched legacy assignments are historical only. */
  async getTechnicianTickets(technicianId: string): Promise<Ticket[]> {
    const canonical = await queryTickets(
      CANONICAL_TICKET_COLLECTION,
      ['assignedTechnicianId', 'technicianId', 'techId'],
      technicianId,
    );
    const legacy = await readLegacyTickets(
      ['assignedTechnicianId', 'technicianId', 'techId'],
      technicianId,
    );
    return mergeCanonicalWithLegacy(canonical, legacy);
  }
}

export const ticketSystemService = new TicketSystemService();
export default ticketSystemService;
