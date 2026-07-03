import React from 'react';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';

export default function PortfolioRenewalsPage() {
  return (
    <Box>
      <Stack spacing={3}>
        <Typography variant="h4" sx={{ color: '#111827', fontWeight: 950 }}>
          Portfolio renewal watch
        </Typography>
        <Card sx={{ border: '1px solid #E5E7EB', borderRadius: 4 }}>
          <CardContent>
            <Typography sx={{ fontWeight: 800, color: '#667085' }}>
              No active renewal record is linked yet.
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
