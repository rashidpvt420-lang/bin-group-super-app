import React from 'react';
import { Stack, Button, Typography, Box, alpha } from '@mui/material';
import { MessageSquare, Mail, Phone } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';

const BIN_CONTACT = {
    whatsappUrl: 'https://wa.me/971552423233',
    email: 'owner@bin-group.com',
};

export const CeoContactButtons: React.FC<{ variant?: 'minimal' | 'full', compact?: boolean }> = ({ variant = 'full', compact = false }) => {
    const handleWhatsApp = () => window.open(BIN_CONTACT.whatsappUrl, '_blank');
    const handleEmail = () => window.location.href = `mailto:${BIN_CONTACT.email}`;

    if (variant === 'minimal' || compact) {
        return (
            <Stack direction="row" spacing={1}>
                <Button
                    size="small"
                    onClick={handleWhatsApp}
                    sx={{ color: '#25D366', fontWeight: 900, textTransform: 'none' }}
                    startIcon={<Phone size={14} />}
                >
                    WhatsApp BIN GROUP
                </Button>
            </Stack>
        );
    }

    return (
        <Box sx={{
            p: 3,
            borderRadius: 4,
            bgcolor: alpha(binThemeTokens.gold, 0.06),
            border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`,
            textAlign: 'center'
        }}>
            <MessageSquare color={binThemeTokens.gold} size={32} style={{ marginBottom: 12 }} />
            <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1 }}>
                CONTACT BIN GROUP
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', mb: 3, display: 'block' }}>
                For property audits, contracts, demos, owner support, and urgent service coordination.
            </Typography>

            <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap">
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
                    sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 950, borderRadius: 2 }}
                >
                    EMAIL
                </Button>
            </Stack>
        </Box>
    );
};
