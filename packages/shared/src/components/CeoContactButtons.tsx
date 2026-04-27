import React from 'react';
import { Stack, Button, Typography, Box, alpha } from '@mui/material';
import { MessageSquare, Mail, Phone, ShieldAlert } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';

export const CeoContactButtons: React.FC<{ variant?: 'minimal' | 'full' }> = ({ variant = 'full' }) => {
    const handleWhatsApp = () => window.open('https://wa.me/971552423233', '_blank');
    const handleEmail = () => window.location.href = 'mailto:Ceo@bin-groups.com';

    if (variant === 'minimal') {
        return (
            <Stack direction="row" spacing={1}>
                <Button 
                    size="small" 
                    onClick={handleWhatsApp}
                    sx={{ color: '#25D366', fontWeight: 900, textTransform: 'none' }}
                    startIcon={<Phone size={14} />}
                >
                    CEO Office
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
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', mb: 3, display: 'block' }}>
                Direct protocol for mission-critical failures or financial disputes.
            </Typography>
            
            <Stack direction="row" spacing={2} justifyContent="center">
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
