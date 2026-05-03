// apps/owner-app/src/pages/public/InvoiceVerificationPage.tsx
import React, { useState } from 'react';
import {
    Container, Paper, Typography, Box, TextField,
    Button, Divider, Alert, CircularProgress
} from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import WarningIcon from '@mui/icons-material/Warning';
import { ShieldCheck } from 'lucide-react';
import { db, doc, getDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';

export default function InvoiceVerificationPage() {
    const { t } = useLanguage();
    const [hash, setHash] = useState('');
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const verifyHash = async () => {
        setLoading(true);
        try {
            const docRef = doc(db, 'invoice_registry', hash.toLowerCase());
            const snap = await getDoc(docRef);

            if (snap.exists()) {
                setStatus({ valid: true, data: snap.data() });
            } else {
                setStatus({ valid: false });
            }
        } catch (e) {
            setStatus({ valid: false });
        }
        setLoading(false);
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: binThemeTokens.black, py: 10 }}>
            <Container maxWidth="sm">
                <Box sx={{ textAlign: 'center', mb: 8 }}>
                    <ShieldCheck size={72} color={binThemeTokens.gold} style={{ marginBottom: 24 }} />
                    <Typography variant="h3" fontWeight="900" sx={{ color: '#FFFFFF', letterSpacing: -1, mb: 1 }}>{t('invoice.registry_title')}</Typography>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, letterSpacing: 4, fontWeight: 900 }}>{t('invoice.sovereign_protocol')}</Typography>
                </Box>

                <Paper sx={{ p: 6, borderRadius: 6, bgcolor: '#161618', border: `1px solid ${binThemeTokens.gold}44`, boxShadow: '0 40px 100px rgba(0,0,0,0.8)' }}>
                    <Typography variant="subtitle2" sx={{ color: binThemeTokens.textSecondary, mb: 2, fontWeight: 900, letterSpacing: 1 }}>{t('invoice.enter_hash')}</Typography>
                    <TextField
                        fullWidth
                        variant="outlined"
                        placeholder="e.g. 5d41402abc4b2a76..."
                        value={hash}
                        onChange={e => setHash(e.target.value)}
                        inputProps={{
                            'aria-label': 'Invoice Hash Identifier',
                            'title': 'Invoice Hash Identifier'
                        }}
                        sx={{
                            mb: 4,
                            '& .MuiOutlinedInput-root': {
                                bgcolor: 'rgba(255,255,255,0.02)',
                                color: '#FFFFFF',
                                fontWeight: 600,
                                borderRadius: 4,
                                '& fieldset': { borderColor: 'rgba(198,167,94,0.2)' },
                                '&:hover fieldset': { borderColor: binThemeTokens.gold },
                            }
                        }}
                    />
                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        onClick={verifyHash}
                        sx={{
                            background: `linear-gradient(135deg, ${binThemeTokens.gold}, ${binThemeTokens.goldLight})`,
                            color: binThemeTokens.black,
                            py: 3,
                            fontWeight: 900,
                            borderRadius: 4,
                            boxShadow: '0 20px 40px rgba(198,167,94,0.2)',
                            fontSize: '1.1rem',
                            letterSpacing: 2,
                            '&:hover': { transform: 'scale(1.02)' }
                        }}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : t('invoice.verify_btn')}
                    </Button>

                    {status && (
                        <Box sx={{ mt: 6 }}>
                            <Divider sx={{ mb: 6, borderColor: 'rgba(198, 167, 94, 0.1)' }} />
                            {status.valid ? (
                                <Alert 
                                    icon={<VerifiedUserIcon sx={{ color: binThemeTokens.gold }} />} 
                                    severity="success" 
                                    sx={{ 
                                        borderRadius: 4, 
                                        bgcolor: 'rgba(198, 167, 94, 0.05)', 
                                        color: '#FFFFFF',
                                        border: `1px solid ${binThemeTokens.gold}33`
                                    }}
                                >
                                    <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{t('invoice.authentic')}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{t('invoice.verified_msg', { entity: status.data?.entityId || 'BIN_CLIENT' })}</Typography>
                                </Alert>
                            ) : (
                                <Alert 
                                    icon={<WarningIcon sx={{ color: '#ff4d4d' }} />} 
                                    severity="error" 
                                    sx={{ 
                                        borderRadius: 4, 
                                        bgcolor: 'rgba(255, 77, 77, 0.05)', 
                                        color: '#FFFFFF',
                                        border: '1px solid rgba(255, 77, 77, 0.2)'
                                    }}
                                >
                                    <Typography variant="subtitle2" fontWeight="900" sx={{ color: '#ff4d4d' }}>{t('invoice.invalid')}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{t('invoice.invalid_msg')}</Typography>
                                </Alert>
                            )}
                        </Box>
                    )}
                </Paper>
                <Box sx={{ mt: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                    <ShieldCheck size={16} color={binThemeTokens.gold} />
                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 2, fontWeight: 900 }}>
                        BIN-GROUP SOVEREIGN PROTOCOL 1.19
                    </Typography>
                </Box>
            </Container>
        </Box>
    );
}
