import React from 'react';
import BlueprintOperationalPage from '../../components/BlueprintOperationalPage';

export default function BrokerReadinessPage() {
  return (
    <BlueprintOperationalPage
      eyebrow="PROPERTY READINESS"
      title="Readiness Checklist"
      subtitle="Checklist route for handoff preparation, required documents, owner confirmations, and launch readiness notes."
      items={[
        { title: 'Documents collected', description: 'Track title deed, ID, contract, and service documents.', status: 'configured' },
        { title: 'Owner handoff notes', description: 'Capture notes before moving a property into operations.', status: 'configured' },
        { title: 'Photo and inspection status', description: 'Prepare site information for maintenance onboarding.', status: 'pending' },
        { title: 'Commission link', description: 'Ready to connect handoff completion with commission workflow.', status: 'configured' },
      ]}
    />
  );
}
