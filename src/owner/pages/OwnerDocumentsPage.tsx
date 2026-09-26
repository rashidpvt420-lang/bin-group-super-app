import React from 'react';
import { Box } from '@mui/material';
import UnifiedDocumentVault from '../../components/UnifiedDocumentVault';

export default function OwnerDocumentsPage() {
  return (
    <Box sx={{ pb: 6 }}>
      <UnifiedDocumentVault
        title="Owner Document Vault"
        subtitle="Contracts, invoices, property reports, inspection reports and other Owner-authorized records."
      />
    </Box>
  );
}
