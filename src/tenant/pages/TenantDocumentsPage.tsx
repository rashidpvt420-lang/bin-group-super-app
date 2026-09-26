import React from 'react';
import { Box } from '@mui/material';
import UnifiedDocumentVault from '../../components/UnifiedDocumentVault';

export default function TenantDocumentsPage() {
  return (
    <Box sx={{ pb: 6 }}>
      <UnifiedDocumentVault
        title="Tenant Document Vault"
        subtitle="Lease, handover and other approved Tenant documents linked to your tenancy."
      />
    </Box>
  );
}
