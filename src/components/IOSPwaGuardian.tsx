import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Stack, alpha, IconButton } from '@mui/material';
import { Share, PlusSquare, Bell, X } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';



export default function IOSPwaGuardian() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const userAgent = window.navigator.userAgent.toLowerCase();
        const ios = /iphone|ipad|ipod/.test(userAgent);
        const standalone = ('standalone' in window.navigator) && (window.navigator as any).standalone;
        
        if (ios && !standalone) {
            const dismissed = sessionStorage.getItem('ios_pwa_banner_dismissed');
            if (!dismissed) setIsVisible(true);
        }
    }, []);

    return (
        <>
            {isVisible && (
                <Paper sx={{ 
                    position: 'fixed', 
                    bottom: 20, 
                    left: '50%', 
                    transform: 'translateX(-50%)', 
                    width: '90%', 
                    maxWidth: 400, 
                    bgcolor: '#0B0B0C', 
                    border: `2px solid ${binThemeTokens.gold}`, 
                    borderRadius: 4, 
                    p: 3, 
                    zIndex: 9999,
                    boxShadow: `0 20px 50px rgba(0,0,0,0.8), 0 0 20px ${alpha(binThemeTokens.gold, 0.2)}`
                }}>
                    <Stack spacing={2}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <Box sx={{ p: 1, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2 }}>
                                    <Bell color={binThemeTokens.gold} size={20} />
                                </Box>
                                <Typography variant="subtitle2" fontWeight="950" color="#FFF">
                                    ENABLE IOS PUSH
                                </Typography>
                            </Stack>
                            <IconButton size="small" onClick={() => setIsVisible(false)} sx={{ color: 'rgba(255,255,255,0.3)' }}>
                                <X size={18} />
                            </IconButton>
                        </Box>

                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                            To receive mission-critical alerts and background updates on iPhone, you must add BIN GROUP to your Home Screen.
                        </Typography>

                        <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', p: 2, borderRadius: 2, border: '1px dashed rgba(255,255,255,0.1)' }}>
                            <Stack spacing={1}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Share size={16} color={binThemeTokens.gold} />
                                    <Typography variant="caption" color="white">1. Tap the <b>Share</b> icon below</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <PlusSquare size={16} color={binThemeTokens.gold} />
                                    <Typography variant="caption" color="white">2. Select <b>'Add to Home Screen'</b></Typography>
                                </Box>
                            </Stack>
                        </Box>

                        <Button 
                            fullWidth 
                            variant="contained" 
                            onClick={() => {
                                sessionStorage.setItem('ios_pwa_banner_dismissed', 'true');
                                setIsVisible(false);
                            }}
                            sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}
                        >
                            GOT IT
                        </Button>
                    </Stack>
                </Paper>
            )}
        </>
    );
}
