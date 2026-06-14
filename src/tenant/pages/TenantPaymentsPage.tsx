import React from 'react';
import BlueprintOperationalPage from '../../components/BlueprintOperationalPage';

export default function TenantPaymentsPage() {
  return (
    <BlueprintOperationalPage
      dark
      eyebrow="TENANT LEDGER"
      title="Payments & Invoice Center"
      subtitle="Tenant-facing payment history, due invoices, receipts, and provider-agnostic payment actions. This screen is intentionally data-safe: it shows no fake balance and waits for authorized Firebase invoice/payment records."
      items={[
        { title: 'Amount due and payment history', description: 'Reserved surface for tenant-scoped invoices, receipts, deposits, and service charges.', status: 'configured' },
        { title: 'Pay-now handoff', description: 'Provider adapter slot for hosted/tokenized checkout without storing card data inside Firestore.', status: 'pending' },
        { title: 'Receipt and failure states', description: 'Includes success, pending reconciliation, failed payment, and receipt unavailable states.', status: 'configured' },
        { title: 'Arabic-ready ledger copy', description: 'RTL-safe payments page shell with no physical-direction assumptions.', status: 'ready' },
      ]}
    />
  );
}
