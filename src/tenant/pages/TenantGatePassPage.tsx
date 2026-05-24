import React from 'react';
import { Box, Typography, Paper, Container, Stack, Button, alpha } from '@mui/material';
import { ShieldCheck, Plus, Clock } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function TenantGatePassPage() {
    const { t } = useLanguage();
    
    return (
        <Container maxWidth="md" sx={{ py: 6 }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <ShieldCheck size={36} color={binThemeTokens.gold} /> Gate Passes
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>
                    Register visitors, contractors, or deliveries to generate security access QR codes.
                </Typography>
            </Box>

            <Paper sx={{ p: 5, textAlign: 'center', bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px dashed ${alpha(binThemeTokens.gold, 0.22)}`, borderRadius: 6 }}>
                <ShieldCheck color={binThemeTokens.gold} size={44} />
                <Typography sx={{ color: '#fff', fontWeight: 950, mt: 2 }}>No Active Gate Passes</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mb: 3 }}>
                    Register your first visitor to generate an access pass.
                </Typography>
                <Button variant="contained" startIcon={<Plus />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3 }}>
                    REGISTER VISITOR
                </Button>
            </Paper>

            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 6, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Clock size={20} color="rgba(255,255,255,0.4)" /> Recent History
            </Typography>
            <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, textAlign: 'center' }}>
                 <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>No previous gate passes found.</Typography>
            </Paper>
        </Container>
    );
}
