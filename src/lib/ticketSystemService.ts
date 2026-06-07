/**
 * BIN GROUP Ticket Management System
 * Core tenant-technician workflow system
 */

import {
  db,
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch
} from './firebase';

export interface Ticket {
  id?: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  title: string;
  description: string;
  category: 'maintenance' | 'repair' | 'plumbing' | 'electrical' | 'hvac' | 'emergency';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'assigned' | 'in-progress' | 'completed' | 'closed';
  assignedTechnicianId?: string;
  location?: {
    lat: number;
    lng: number;
    address: string;
  };
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
  statusHistory?: Array<{
    status: string;
    timestamp: any;
    notes?: string;
  }>;
}

class TicketSystemService {
  /**
   * Tenant creates a new maintenance request
   */
  async createTicket(tenantId: string, ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'tickets'), {
        ...ticket,
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        statusHistory: [
          {
            status: 'open',
            timestamp: serverTimestamp(),
            notes: 'Ticket created by tenant'
          }
        ]
      });

      console.log('[Ticket System] New ticket created:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('[Ticket System] Failed to create ticket:', error);
      throw error;
    }
  }

  /**
   * Admin assigns ticket to technician
   */
  async assignTicket(ticketId: string, technicianId: string, notes?: string): Promise<void> {
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      await updateDoc(ticketRef, {
        assignedTechnicianId: technicianId,
        status: 'assigned',
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Add to status history
      const batch = writeBatch(db);
      batch.update(ticketRef, {
        statusHistory: {
          status: 'assigned',
          timestamp: serverTimestamp(),
          notes: notes || `Assigned to technician ${technicianId}`
        }
      });
      await batch.commit();

      console.log('[Ticket System] Ticket assigned to technician:', technicianId);
    } catch (error) {
      console.error('[Ticket System] Failed to assign ticket:', error);
      throw error;
    }
  }

  /**
   * Technician starts work on ticket
   */
  async startTicket(ticketId: string, technicianId: string): Promise<void> {
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      await updateDoc(ticketRef, {
        status: 'in-progress',
        updatedAt: serverTimestamp()
      });
      console.log('[Ticket System] Ticket started by technician:', technicianId);
    } catch (error) {
      console.error('[Ticket System] Failed to start ticket:', error);
      throw error;
    }
  }

  /**
   * Technician completes ticket with photos & notes
   */
  async completeTicket(
    ticketId: string,
    technicianId: string,
    data: {
      photos?: Array<{ url: string; description?: string }>;
      notes?: string;
      actualCost?: number;
    }
  ): Promise<void> {
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      await updateDoc(ticketRef, {
        status: 'completed',
        completionNotes: data.notes || '',
        actualCost: data.actualCost || 0,
        photos: data.photos || [],
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log('[Ticket System] Ticket completed by technician:', technicianId);
    } catch (error) {
      console.error('[Ticket System] Failed to complete ticket:', error);
      throw error;
    }
  }

  /**
   * Tenant approves/rejects completed work
   */
  async approveTicket(ticketId: string, tenantId: string, approved: boolean, rating?: number): Promise<void> {
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      await updateDoc(ticketRef, {
        status: approved ? 'closed' : 'in-progress',
        tenantApproval: approved,
        tenantRating: rating || 0,
        updatedAt: serverTimestamp()
      });
      console.log('[Ticket System] Ticket approval:', approved ? 'APPROVED' : 'REJECTED');
    } catch (error) {
      console.error('[Ticket System] Failed to approve ticket:', error);
      throw error;
    }
  }

  /**
   * Get tickets for tenant
   */
  async getTenantTickets(tenantId: string): Promise<Ticket[]> {
    try {
      const q = query(
        collection(db, 'tickets'),
        where('tenantId', '==', tenantId),
        orderBy('createdAt', 'desc')
      );

      const snap = await getDocs(q);
      return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Ticket));
    } catch (error) {
      console.error('[Ticket System] Failed to fetch tenant tickets:', error);
      throw error;
    }
  }

  /**
   * Get tickets for technician
   */
  async getTechnicianTickets(technicianId: string): Promise<Ticket[]> {
    try {
      const q = query(
        collection(db, 'tickets'),
        where('assignedTechnicianId', '==', technicianId),
        orderBy('priority', 'desc'),
        orderBy('createdAt', 'desc')
      );

      const snap = await getDocs(q);
      return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Ticket));
    } catch (error) {
      console.error('[Ticket System] Failed to fetch technician tickets:', error);
      throw error;
    }
  }
}

export const ticketSystemService = new TicketSystemService();
export default ticketSystemService;
