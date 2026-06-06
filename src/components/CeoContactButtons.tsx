import React from 'react';
import { Stack, Button } from '@mui/material';
import { Phone } from 'lucide-react';

const BIN_CONTACT = {
  whatsappUrl: 'https://wa.me/971552423233',
  email: 'CEO@bin-groups.com',
};

export const CeoContactButtons: React.FC<{ variant?: 'minimal' | 'full', compact?: boolean }> = () => {
  const handleWhatsApp = () => window.open(BIN_CONTACT.whatsappUrl, '_blank');
  return (
    <Stack direction="row" spacing={1}>
      <Button size="small" onClick={handleWhatsApp} sx={{ color: '#25D366', fontWeight: 900, textTransform: 'none' }} startIcon={<Phone size={14} />}>
        WhatsApp BIN GROUP
      </Button>
    </Stack>
  );
};
