import React from 'react';
import BlueprintOperationalPage from '../../components/BlueprintOperationalPage';

export default function OwnerApprovalsPage() {
  return (
    <BlueprintOperationalPage
      eyebrow="OWNER CONTROL"
      title="Approvals Queue"
      subtitle="Central owner queue for quote approvals, invoice approvals, SLA exceptions, and maintenance authorization decisions. It avoids fake records and is ready for Firestore-scoped approval documents."
      items={[
        { title: 'Quote and invoice approvals', description: 'Owner can approve/reject commercial exceptions with mandatory notes and audit capture.', status: 'configured' },
        { title: 'Maintenance authorization', description: 'Approval surface for work requiring owner consent before technician dispatch or invoice release.', status: 'configured' },
        { title: 'SLA exception visibility', description: 'Owner sees blocked approvals and breached timers without mixing breach state into ticket status.', status: 'ready' },
        { title: 'Audit trail compatibility', description: 'Every approval decision is designed to map to immutable audit events.', status: 'ready' },
      ]}
    />
  );
}
