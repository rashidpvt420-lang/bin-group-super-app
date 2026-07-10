import React from 'react';
import { Stack, Button, Typography, Box, alpha } from '@mui/material';
import { Mail, Phone, ShieldAlert } from 'lucide-react';

export type CeoContactButtonsProps = {
    variant?: 'minimal' | 'full';
    compact?: boolean;
};

export const CeoContactButtons: React.FC<CeoContactButtonsProps> = ({ variant = 'full', compact = false }) => {
    const handleWhatsApp = () => window.open('https://wa.me/971552423233', '_blank', 'noopener,noreferrer');
    const handleEmail = () => { window.location.href = 'mailto:ceo@bin-groups.com'; };
    const minimal = compact || variant === 'minimal';

    if (minimal) {
        return (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button
                    size="small"
                    onClick={handleWhatsApp}
                    sx={{ color: '#25D366', borderColor: 'rgba(37,211,102,0.45)', fontWeight: 900, textTransform: 'none' }}
                    variant="outlined"
                    startIcon={<Phone size={14} />}
                >
                    WhatsApp CEO Office
                </Button>
                <Button
                    size="small"
                    onClick={handleEmail}
                    sx={{ color: 'inherit', borderColor: 'rgba(148,163,184,0.35)', fontWeight: 900, textTransform: 'none' }}
                    variant="outlined"
                    startIcon={<Mail size={14} />}
                >
                    Email CEO Office
                </Button>
            </Stack>
        );
    }

    return (
        <Box sx={{
            p: 3,
            borderRadius: 4,
            bgcolor: alpha('#ef4444', 0.05),
            border: '1px solid rgba(239, 68, 68, 0.2)',
            textAlign: 'center'
        }}>
            <ShieldAlert color="#ef4444" size={32} style={{ marginBottom: 12 }} />
            <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#ef4444', mb: 1 }}>
                ESCALATE TO CEO OFFICE
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', mb: 3, display: 'block' }}>
                Direct protocol for mission-critical failures or financial disputes.
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
                <Button
                    variant="contained"
                    onClick={handleWhatsApp}
                    startIcon={<Phone size={18} />}
                    sx={{ bgcolor: '#25D366', color: '#FFF', fontWeight: 950, borderRadius: 2 }}
                >
                    WHATSAPP
                </Button>
                <Button
                    variant="outlined"
                    onClick={handleEmail}
                    startIcon={<Mail size={18} />}
                    sx={{ borderColor: 'divider', color: 'text.primary', fontWeight: 950, borderRadius: 2 }}
                >
                    EMAIL
                </Button>
            </Stack>
        </Box>
    );
};
