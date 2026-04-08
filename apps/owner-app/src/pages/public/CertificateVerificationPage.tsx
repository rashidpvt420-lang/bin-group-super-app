// apps/owner-app/src/pages/public/CertificateVerificationPage.tsx
import React, { useState } from 'react';
import { 
    Container, Paper, Typography, Box, TextField, 
    Button, Divider, Alert, CircularProgress, Chip, Stack 
} from '@mui/material';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import DescriptionIcon from '@mui/icons-material/Description';
import { ShieldCheck } from 'lucide-react';
import { db, doc, getDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

export default function CertificateVerificationPage() {
    const { t } = useLanguage();
    const [certId, setCertId] = useState('');
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const verifyCert = async () => {
        setLoading(true);
        try {
            const docRef = doc(db, 'certificates', certId.toUpperCase());
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
                    <Typography variant="h3" fontWeight="900" sx={{ color: '#FFFFFF', letterSpacing: -1, mb: 1 }}>{t('cert.registry_title')}</Typography>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, letterSpacing: 4, fontWeight: 900 }}>{t('cert.sovereign_protocol')}</Typography>
                </Box>

                <Paper sx={{ p: 6, borderRadius: 6, bgcolor: '#161618', border: `1px solid ${binThemeTokens.gold}44`, boxShadow: '0 40px 100px rgba(0,0,0,0.8)' }}>
                    <Typography variant="subtitle2" sx={{ color: binThemeTokens.textSecondary, mb: 2, fontWeight: 900, letterSpacing: 1 }}>{t('cert.enter_id')}</Typography>
                    <TextField 
                        fullWidth 
                        variant="outlined" 
                        placeholder="e.g. CERT-2026-DXB-001" 
                        value={certId} 
                        onChange={e => setCertId(e.target.value)}
                        inputProps={{
                            'aria-label': 'Certificate Identifier',
                            'title': 'Certificate Identifier'
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
                        onClick={verifyCert}
                        sx={{ 
                            background: `linear-gradient(135deg, ${binThemeTokens.gold}, ${binThemeTokens.goldLight})`,
                            color: binThemeTokens.black,
                            py: 3, 
                            fontWeight: 900,
                            borderRadius: 4,
                            boxShadow: '0 20px 40px rgba(198, 167, 94, 0.2)',
                            fontSize: '1.1rem',
                            letterSpacing: 2,
                            '&:hover': { transform: 'scale(1.02)' }
                        }}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : t('cert.validate_btn')}
                    </Button>

                    {status && (
                        <Box sx={{ mt: 6 }}>
                            <Divider sx={{ mb: 6, borderColor: 'rgba(198, 167, 94, 0.1)' }} />
                            {status.valid ? (
                                <Box>
                                    <Alert 
                                        icon={<WorkspacePremiumIcon sx={{ color: binThemeTokens.gold }} />} 
                                        severity="success" 
                                        sx={{ 
                                            borderRadius: 4, 
                                            bgcolor: 'rgba(198, 167, 94, 0.05)', 
                                            color: '#FFFFFF',
                                            border: `1px solid ${binThemeTokens.gold}33`,
                                            mb: 3
                                        }}
                                    >
                                        <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{t('cert.authentic')}</Typography>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{t('cert.verified_msg')}</Typography>
                                    </Alert>
                                    <Box sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <Stack direction="row" spacing={3} alignItems="center">
                                            <DescriptionIcon sx={{ color: binThemeTokens.gold }} />
                                            <Box>
                                                <Typography variant="subtitle2" fontWeight="900" sx={{ color: '#FFFFFF' }}>{t('cert.type_label', { type: status.data?.type || 'Standard' })}</Typography>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{t('cert.score_label', { score: status.data?.score || '100' })}</Typography>
                                            </Box>
                                        </Stack>
                                    </Box>
                                </Box>
                            ) : (
                                <Alert 
                                    icon={<DescriptionIcon sx={{ color: '#ff4d4d' }} />} 
                                    severity="error" 
                                    sx={{ 
                                        borderRadius: 4, 
                                        bgcolor: 'rgba(255, 77, 77, 0.05)', 
                                        color: '#FFFFFF',
                                        border: '1px solid rgba(255, 77, 77, 0.2)'
                                    }}
                                >
                                    <Typography variant="subtitle2" fontWeight="900" sx={{ color: '#ff4d4d' }}>{t('cert.invalid')}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{t('cert.invalid_msg')}</Typography>
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
