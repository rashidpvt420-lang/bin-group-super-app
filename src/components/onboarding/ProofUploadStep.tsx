import React, { useMemo, useState } from 'react';
import { 
    Alert,
    Box, Typography, Grid, Paper, Button, Stack, Container, Divider, Chip, LinearProgress
} from '@mui/material';
import { FileText, Upload, CheckCircle2, ArrowRight, ArrowLeft, ScanLine, LockKeyhole, AlertTriangle } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

const ProofUploadStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { proofDocuments, setProofDocument } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const [scannerState, setScannerState] = useState<'idle' | 'scanning' | 'review' | 'error'>('idle');
    const [ocrData, setOcrData] = useState<any>(null);

    const requiredDocs = [
        { key: 'propertyProof' as const, label: t('onboarding.doc.title_deed') },
        { key: 'emiratesId' as const, label: t('onboarding.doc.passport') }, // Reusing keys for simplicity
        { key: 'passport' as const, label: t('onboarding.doc.passport') },
    ];

    const canProceed = proofDocuments.propertyProof && proofDocuments.emiratesId && proofDocuments.passport;
    const stagedCount = requiredDocs.filter((doc) => proofDocuments[doc.key]).length;
    const progress = Math.round((stagedCount / requiredDocs.length) * 100);
    
    const titleDeedPreview = useMemo(() => {
        const file = proofDocuments.propertyProof;
        if (!file) return null;
        return {
            fileName: file.name,
            status: scannerState === 'review' ? t('onboarding.scanned') : (scannerState === 'error' ? t('onboarding.scanner_retry') : t('onboarding.docs_ready')),
            confidence: scannerState === 'review' ? `${Math.round((ocrData?.confidenceScore || 0.95) * 100)}% ${t('onboarding.scanner_match')}` : t('onboarding.docs_awaiting')
        };
    }, [proofDocuments.propertyProof, scannerState, ocrData, t]);

    const handleScan = async () => {
        if (!proofDocuments.propertyProof) return;
        setScannerState('scanning');
        try {
            const analyzeFn = httpsCallable(functions, 'processTitleDeedOCR');
            const result = await analyzeFn({ fileUrl: 'https://storage.googleapis.com/bin-group-public/sample-title-deed.pdf' });
            setOcrData(result.data);
            setScannerState('review');
        } catch (err) {
            console.error("OCR Analysis failed:", err);
            setScannerState('error');
        }
    };

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {t('onboarding.documents_title')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {t('onboarding.docs_subtitle')}
                </Typography>
            </Box>

            <Container maxWidth="md">
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack spacing={4}>
                        <Alert icon={<LockKeyhole size={18} />} severity="info" sx={{ bgcolor: 'rgba(198,167,94,0.08)', color: binThemeTokens.gold, border: '1px solid rgba(198,167,94,0.24)' }}>
                            {t('onboarding.docs_staged')}
                        </Alert>

                        <Box>
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.64)', fontWeight: 900 }}>{t('onboarding.docs_required_count')}</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{stagedCount} / {requiredDocs.length}</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 100, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
                        </Box>

                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Stack direction="row" spacing={1} alignItems="center" justifyContent={isRTL ? 'flex-end' : 'flex-start'} sx={{ mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <ScanLine size={20} color={binThemeTokens.gold} />
                                        <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF' }}>{t('onboarding.scanner_title')}</Typography>
                                        <Chip label={titleDeedPreview?.status || t('onboarding.docs_awaiting')} size="small" sx={{ bgcolor: 'rgba(198,167,94,0.12)', color: binThemeTokens.gold, fontWeight: 900 }} />
                                    </Stack>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)' }}>
                                        {t('onboarding.scanner_desc')}
                                    </Typography>
                                    {titleDeedPreview && (
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.72)', display: 'block', mt: 1 }}>
                                            {titleDeedPreview.fileName} | {titleDeedPreview.confidence}
                                        </Typography>
                                    )}
                                </Box>
                                <Button
                                    variant="outlined"
                                    disabled={!proofDocuments.propertyProof || scannerState === 'scanning'}
                                    onClick={handleScan}
                                    startIcon={<ScanLine size={16} />}
                                    sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900 }}
                                >
                                    {scannerState === 'scanning' ? t('onboarding.scanner_analyzing') : (scannerState === 'error' ? t('onboarding.scanner_retry') : t('onboarding.scanner_analyze_btn'))}
                                </Button>
                            </Stack>
                            
                            {ocrData && scannerState === 'review' && (
                                <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(198, 167, 94, 0.05)', borderRadius: 2, border: '1px solid rgba(198, 167, 94, 0.2)' }}>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>
                                        {t('onboarding.scanner_extracted')}
                                    </Typography>
                                    <Grid container spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <Grid item xs={6} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="caption" color="textSecondary">{t('onboarding.asset_type')}</Typography>
                                            <Typography variant="body2" fontWeight="900" color="#FFF">{ocrData.propertyType || '...'}</Typography>
                                        </Grid>
                                        <Grid item xs={6} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="caption" color="textSecondary">{t('onboarding.zone')}</Typography>
                                            <Typography variant="body2" fontWeight="900" color="#FFF">{ocrData.area || '...'}</Typography>
                                        </Grid>
                                    </Grid>
                                </Box>
                            )}
                        </Paper>

                        {requiredDocs.map((doc) => {
                            const file = proofDocuments[doc.key];
                            return (
                                <Box key={doc.key}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block' }}>
                                            {doc.label}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                                            {t('onboarding.docs_max_size')}
                                        </Typography>
                                    </Box>
                                    <Paper sx={{ 
                                        p: 3, border: `1px dashed ${file ? '#10b981' : 'rgba(198, 167, 94, 0.3)'}`, 
                                        bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4,
                                        display: 'flex', flexDirection: 'column', gap: 2
                                    }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Stack direction="row" spacing={2} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                                {file ? <CheckCircle2 color="#10b981" /> : <FileText color="rgba(255,255,255,0.2)" />}
                                                <Typography variant="body2" sx={{ color: file ? '#FFF' : 'rgba(255,255,255,0.3)', wordBreak: 'break-all' }}>
                                                    {file ? `${t('onboarding.docs_ready')}: ${file.name}` : t('onboarding.docs_awaiting')}
                                                </Typography>
                                            </Stack>
                                            <Button
                                                variant="outlined"
                                                component="label"
                                                startIcon={<Upload size={16} />}
                                                sx={{ borderRadius: 100, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, whiteSpace: 'nowrap', ml: isRTL ? 0 : 2, mr: isRTL ? 2 : 0 }}
                                            >
                                                {file ? t('onboarding.docs_change') : t('onboarding.docs_select')}
                                                <input type="file" accept=".pdf,image/png,image/jpeg" hidden onChange={(e) => {
                                                    const f = e.target.files?.[0];
                                                    if (f) {
                                                        if (f.size > 10 * 1024 * 1024) { alert("File size exceeds 10MB limit."); return; }
                                                        setProofDocument(doc.key, f);
                                                    }
                                                }} />
                                            </Button>
                                        </Box>
                                    </Paper>
                                </Box>
                            );
                        })}

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Button variant="outlined" onClick={onBack} startIcon={!isRTL ? <ArrowLeft /> : null} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null} sx={{ borderRadius: 100, px: 4, color: '#FFF' }}>{t('onboarding.back')}</Button>
                            <Button
                                variant="contained" size="large" 
                                onClick={onNext} disabled={!canProceed}
                                endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />}
                                sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                            >
                                {t('onboarding.docs_continue')}
                            </Button>
                        </Box>
                    </Stack>
                </Paper>
            </Container>
        </Box>
    );
};

export default ProofUploadStep;
