import React from 'react';
import BlueprintOperationalPage from '../../components/BlueprintOperationalPage';

export default function TechnicianOfflinePage() {
  return (
    <BlueprintOperationalPage
      eyebrow="FIELD RESILIENCE"
      title="Offline Sync Queue"
      subtitle="Technician queue surface for pending evidence uploads, job notes, check-in/out actions, and retryable updates when connectivity returns."
      items={[
        { title: 'Pending evidence', description: 'Reserved queue for before and after media that must not be lost during site work.', status: 'configured' },
        { title: 'Retryable job actions', description: 'Safe place for accept, on-site, work-log, and completion actions waiting for sync.', status: 'configured' },
        { title: 'Manual sync review', description: 'Technician can review queued work before retrying upload or contacting support.', status: 'pending' },
        { title: 'Confirmed reconciliation', description: 'Offline actions remain pending until Firebase confirms completion.', status: 'ready' },
      ]}
    />
  );
}
