import * as admin from "firebase-admin";

type TicketRecord = {
  id: string;
  status?: string;
  propertyId?: string;
  tenantId?: string;
  assignedTechnicianId?: string;
};

type AuditResult = {
  orphans: TicketRecord[];
  badStatus: TicketRecord[];
};

export async function runTempAudit(): Promise<AuditResult> {
  const orphans: TicketRecord[] = [];
  const badStatus: TicketRecord[] = [];

  const snapshot = await admin.firestore().collection("maintenanceTickets").get();

  snapshot.forEach((doc) => {
    const data = doc.data() as Omit<TicketRecord, "id">;
    const ticket: TicketRecord = { id: doc.id, ...data };

    const missingRelations = !ticket.propertyId || !ticket.tenantId;
    const invalidStatus = !ticket.status;

    if (missingRelations) {
      orphans.push(ticket);
    }

    if (invalidStatus) {
      badStatus.push(ticket);
    }
  });

  return { orphans, badStatus };
}
