import React from 'react';
import { Button, Stack } from '@mui/material';
import { Mail, MessageCircle } from 'lucide-react';
import { binThemeTokens } from '../theme/adminTheme';

export default function CeoContactButtons({ compact = false }: { compact?: boolean }) {
    return (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button
                component="a"
                href="https://wa.me/971552423233"
                target="_blank"
                rel="noreferrer"
                size={compact ? 'small' : 'medium'}
                variant="outlined"
                startIcon={<MessageCircle size={16} />}
                sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900, textTransform: 'none' }}
            >
                WhatsApp CEO Office
            </Button>
            <Button
                component="a"
                href="mailto:Ceo@bin-groups.com"
                size={compact ? 'small' : 'medium'}
                variant="outlined"
                startIcon={<Mail size={16} />}
                sx={{ color: binThemeTokens.textPrimary, borderColor: binThemeTokens.border || '#E5E7EB', fontWeight: 900, textTransform: 'none' }}
            >
                Email CEO Office
            </Button>
        </Stack>
    );
}
