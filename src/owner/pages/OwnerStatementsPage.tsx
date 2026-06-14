import React from 'react';
import BlueprintOperationalPage from '../../components/BlueprintOperationalPage';

export default function OwnerStatementsPage() {
  return (
    <BlueprintOperationalPage
      eyebrow="OWNER FINANCE"
      title="Statements Center"
      subtitle="Owner monthly statements, downloads, payment-plan visibility, and maintenance deductions. This screen is the dedicated owner statement route from the blueprint."
      items={[
        { title: 'Monthly statements', description: 'Prepared route for owner-scoped statement PDFs and downloadable financial packs.', status: 'configured' },
        { title: 'Maintenance deductions', description: 'Statement model supports linking ticket costs, invoice references, and evidence proof.', status: 'configured' },
        { title: 'Payment-plan visibility', description: 'Reserved support for monthly, quarterly, and annual plan tracking.', status: 'pending' },
        { title: 'Document center handoff', description: 'Statement downloads can link into the existing owner documents vault.', status: 'ready' },
      ]}
    />
  );
}
