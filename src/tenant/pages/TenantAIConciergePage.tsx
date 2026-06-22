import React, { useState } from 'react';
import { Box, Button, Container, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { Bot, Send } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function TenantAIConciergePage() {
  const { tx, isRTL } = useLanguage();
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('Describe the issue and BIN AI will prepare a no-call maintenance ticket draft.');

  const analyze = () => {
    const text = message.trim();
    if (!text) return;
    const lower = text.toLowerCase();
    const category = lower.includes('ac') || lower.includes('air') ? 'AC / Cooling' : lower.includes('water') || lower.includes('leak') ? 'Plumbing' : lower.includes('power') || lower.includes('light') ? 'Electrical' : 'General Maintenance';
    const priority = lower.includes('urgent') || lower.includes('not working') ? 'HIGH' : 'NORMAL';
    setReply(`Draft ready: ${category}, ${priority} priority. Next step: submit with unit, location, and photo evidence so dispatch can proceed without a phone call.`);
  };

  return (
    <Container maxWidth="md" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={3}>
        <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,.78)', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 6 }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{tx('ai.eyebrow', 'NO-CALL MAINTENANCE')}</Typography>
          <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, mt: 1 }}>{tx('ai.title', 'BIN AI Concierge')}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.56)', mt: 1 }}>{tx('ai.subtitle', 'Explain the issue. The assistant prepares category, priority, evidence, and dispatch intent.')}</Typography>
        </Paper>
        <Paper sx={{ p: 3, bgcolor: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
          <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 4, mb: 2 }}>
            <Typography sx={{ color: '#fff', fontWeight: 800 }}>{reply}</Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth multiline minRows={2} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Example: AC is not cooling in bedroom" sx={{ '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.035)', borderRadius: 4 } }} />
            <Button variant="contained" onClick={analyze} startIcon={<Bot size={18} />} endIcon={<Send size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4, px: 3 }}>Analyze</Button>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
