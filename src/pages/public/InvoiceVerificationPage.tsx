// apps/owner-app/src/pages/public/InvoiceVerificationPage.tsx
import React, { useEffect, useState } from 'react';
import {
    Container, Paper, Typography, Box, TextField,
    Button, Divider, Alert, CircularProgress, Chip, Stack
} from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import WarningIcon from '@mui/icons-material/Warning';
import { ShieldCheck } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { db, doc, getDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '@bin/shared';

const registryFor = (type: string) => type === 'contract' ? 'contract_registry' : 'invoice_registry';

export default function InvoiceVerificationPage() {
    const { t } = useLanguage();
    const { id: routeHash } = useParams();
    const [searchParams] = useSearchParams();
    const proofType = String(searchParams.get('type') || 'invoice').toLowerCase();
    const externalId = searchParams.get('id') || '';
    const reference = searchParams.get('ref') || '';
    const [hash, setHash] = useState(routeHash || searchParams.get('hash') || '');
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const verifyHash = async (nextHash = hash) => {
        const normalized = String(nextHash || '').trim().toLowerCase();
        if (!normalized) return;
        setLoading(true);
        try {
            const docRef = doc(db, registryFor(proofType), normalized);
            const snap = await getDoc(docRef);

            if (snap.exists()) {
                setStatus({ valid: true, data: snap.data(), hash: normalized });
            } else {
                setStatus({ valid: false, hash: normalized });
            }
        } catch (e) {
            setStatus({ valid: false, hash: normalized });
        }
        setLoading(false);
    };

    useEffect(() => {
        const incoming = routeHash || searchParams.get('hash') || '';
        if (incoming) {
            setHash(incoming);
            verifyHash(incoming);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routeHash, searchParams]);

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: binThemeTokens.black, py: 10 }}>
            <Container maxWidth="sm">
                <Box sx={{ textAlign: 'center', mb: 8 }}>
                    <ShieldCheck size={72} color={binThemeTokens.gold} style={{ marginBottom: 24 }} />
                    <Typography variant="h3" fontWeight="900" sx={{ color: '#FFFFFF', letterSpacing: -1, mb: 1 }}>{proofType === 'contract' ? 'Contract Verification Registry' : t('invoice.registry_title')}</Typography>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, letterSpacing: 4, fontWeight: 900 }}>{t('invoice.sovereign_protocol')}</Typography>
                </Box>

                <Paper sx={{ p: 6, borderRadius: 6, bgcolor: '#161618', border: `1px solid ${binThemeTokens.gold}44`, boxShadow: '0 40px 100px rgba(0,0,0,0.8)' }}>
                    <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
                        <Chip label={proofType.toUpperCase()} sx={{ bgcolor: 'rgba(198,167,94,0.12)', color: binThemeTokens.gold, fontWeight: 900 }} />
                        {externalId && <Chip label={`ID: ${externalId}`} sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 800 }} />}
                        {reference && <Chip label={`REF: ${reference}`} sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 800 }} />}
                    </Stack>
                    <Typography variant="subtitle2" sx={{ color: binThemeTokens.textSecondary, mb: 2, fontWeight: 900, letterSpacing: 1 }}>{proofType === 'contract' ? 'Enter Contract Proof Hash' : t('invoice.enter_hash')}</Typography>
                    <TextField
                        fullWidth
                        variant="outlined"
                        placeholder="e.g. 5d41402abc4b2a76..."
                        value={hash}
                        onChange={e => setHash(e.target.value)}
                        inputProps={{
                            'aria-label': 'Invoice or Contract Hash Identifier',
                            'title': 'Invoice or Contract Hash Identifier'
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
                        onClick={() => verifyHash()}
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
                                    <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{proofType === 'contract' ? 'Authentic Contract Record' : t('invoice.authentic')}</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{t('invoice.verified_msg', { entity: status.data?.entityId || status.data?.ownerId || 'BIN_CLIENT' })}</Typography>
                                    <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.textSecondary, mt: 1 }}>Hash: {status.hash}</Typography>
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
                                    <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.textSecondary, mt: 1 }}>Checked: {status.hash}</Typography>
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
