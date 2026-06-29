import React from 'react';
import { Box, Container, Typography } from '@mui/material';
import { binThemeTokens } from '../theme/binGroupTheme';

type OwnerPageFrameProps = {
  title: string;
  children: React.ReactNode;
};

export default function OwnerPageFrame({ title, children }: OwnerPageFrameProps) {
  return (
    <Container maxWidth="xl" sx={{ py: 6 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
          OWNER OPERATIONS
        </Typography>
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 950, mt: 0.5 }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Container>
  );
}
