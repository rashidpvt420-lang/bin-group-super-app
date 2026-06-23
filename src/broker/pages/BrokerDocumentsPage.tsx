import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress,
    Chip, alpha, LinearProgress, IconButton, Tooltip, Snackbar, Alert
} from '@mui/material';
import {
    FileUp, FileText, CheckCircle2, Clock, AlertCircle,
    ShieldCheck, Eye, Trash2, Download, Info,
    Lock, Share2, MoreVertical
} from 'lucide-react';
import { db, storage, collection, query, where, addDoc, serverTimestamp, onSnapshot, ref, uploadBytes, getDownloadURL } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

export default function BrokerDocumentsPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingDocType = useRef<string | null>(null);

    useEffect(() => {
        if (!user?.uid) return;
        const q = query(collection(db, 'brokerDocuments'), where('brokerId', '==', user.uid));
        const unsub = onSnapshot(q, (snap) => {
            setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, [user]);

    const handleUpload = (docType: string) => {
        if (!user?.uid || uploading) return;
        pendingDocType.current = docType;
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const docType = pendingDocType.current;
        // Reset the input so selecting the same file again still fires onChange.
        e.target.value = '';
        if (!file || !docType || !user?.uid) return;

        if (file.size > 15 * 1024 * 1024) {
            setUploadError('File is too large. Please upload a PDF or image under 15 MB.');
            return;
        }

        setUploading(docType);
        try {
            const safeName = file.name.replace(/[^\w.-]+/g, '_');
            const fileRef = ref(storage, `brokerDocuments/${user.uid}/${docType}/${Date.now()}_${safeName}`);
            await uploadBytes(fileRef, file);
            const fileUrl = await getDownloadURL(fileRef);
            await addDoc(collection(db, 'brokerDocuments'), {
                brokerId: user.uid,
                fileName: file.name,
                fileUrl,
                fileSize: file.size,
                contentType: file.type || 'application/octet-stream',
                docType,
                status: 'pending_review',
                uploadedAt: serverTimestamp()
            });
        } catch (err) {
            console.error('[BrokerDocuments] Upload failed:', err);
            setUploadError('Upload failed. Please check your connection and try again.');
        } finally {
            setUploading(null);
            pendingDocType.current = null;
        }
    };

    const getDocStatus = (type: string) => {
        const doc = documents.find(d => d.docType === type);
        if (!doc) return { status: 'missing', label: 'PENDING UPLOAD', color: '#ef4444', icon: <AlertCircle size={14} /> };
        if (doc.status === 'verified') return { status: 'verified', label: 'VERIFIED', color: '#10b981', icon: <CheckCircle2 size={14} /> };
        return { status: 'pending', label: 'UNDER REVIEW', color: binThemeTokens.gold, icon: <Clock size={14} /> };
    };

    const requiredDocs = [
        { type: 'emirates_id', title: 'Emirates ID Registry', desc: 'Valid Front & Back scan required for transaction clearing.' },
        { type: 'rera_license', title: 'RERA Brokerage Permit', desc: 'Institutional verification of real estate professional status.' },
        { type: 'bank_details', title: 'Institutional IBAN', desc: 'Certified bank letter for automated commission settlement.' },
        { type: 'broker_agreement', title: 'Sovereign Agreement', desc: 'Signed partnership terms with BIN Group.' }
    ];

    return (
        <BrokerPageFrame
            title="Sovereign Vault"
            subtitle="Secure document archive for compliance and verification"
            loading={loading}
            actions={
                <Box sx={{ p: 2, bgcolor: alpha('#10b981', 0.1), borderRadius: 3, border: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <ShieldCheck size={20} color="#10b981" />
                    <Box>
                        <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 950, display: 'block' }}>COMPLIANCE STATUS</Typography>
                        <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 900 }}>LEVEL 2 VERIFIED</Typography>
                    </Box>
                </Box>
            }
        >
            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, letterSpacing: 2, mb: 3, display: 'block' }}>
                MANDATORY COMPLIANCE ASSETS
            </Typography>

            <Grid container spacing={3} sx={{ mb: 6 }}>
                {requiredDocs.map(req => {
                    const status = getDocStatus(req.type);
                    const isUploaded = status.status !== 'missing';
                    const uploadedDoc = documents.find(d => d.docType === req.type);

                    return (
                        <Grid item xs={12} md={6} key={req.type}>
                            <Paper sx={{
                                p: 4,
                                bgcolor: binThemeTokens.softCanvas,
                                border: `1px solid ${alpha(status.color, 0.15)}`,
                                borderRadius: 6,
                                position: 'relative',
                                transition: 'all 0.3s ease',
                                '&:hover': { bgcolor: '#FFFFFF', borderColor: status.color }
                            }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                                    <Box>
                                        <Typography variant="h6" fontWeight="950" color={binThemeTokens.textPrimary}>{req.title}</Typography>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.5, fontWeight: 700 }}>{req.desc}</Typography>
                                    </Box>
                                    <Chip
                                        label={status.label}
                                        size="small"
                                        icon={status.icon}
                                        sx={{ bgcolor: alpha(status.color, 0.1), color: status.color, fontWeight: 950, fontSize: '0.65rem' }}
                                    />
                                </Stack>

                                {uploading === req.type ? (
                                    <Box sx={{ mt: 3 }}>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1, display: 'block' }}>ENCRYPTING ASSET...</Typography>
                                        <LinearProgress sx={{ height: 4, borderRadius: 2, bgcolor: '#E5E7EB', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
                                    </Box>
                                ) : isUploaded ? (
                                    <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
                                        <Button
                                            variant="contained"
                                            fullWidth
                                            component="a"
                                            href={uploadedDoc?.fileUrl || undefined}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            disabled={!uploadedDoc?.fileUrl}
                                            startIcon={<Eye size={18} />}
                                            sx={{ bgcolor: '#F3F4F6', color: binThemeTokens.textPrimary, fontWeight: 950, borderRadius: 3, '&:hover': { bgcolor: '#E5E7EB' } }}
                                        >
                                            PREVIEW
                                        </Button>
                                        <Tooltip title="Replace Asset">
                                            <IconButton onClick={() => handleUpload(req.type)} sx={{ bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 3, color: binThemeTokens.textSecondary }}>
                                                <FileUp size={20} />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                ) : (
                                    <Button 
                                        variant="outlined" 
                                        fullWidth 
                                        startIcon={<FileUp size={18} />}
                                        onClick={() => handleUpload(req.type)}
                                        sx={{ mt: 4, borderColor: alpha(status.color, 0.3), color: status.color, fontWeight: 950, py: 1.5, borderRadius: 3, '&:hover': { borderColor: status.color, bgcolor: alpha(status.color, 0.05) } }}
                                    >
                                        UPLOAD SECURE FILE
                                    </Button>
                                )}
                            </Paper>
                        </Grid>
                    );
                })}
            </Grid>

            {/* ─── ADD-ON REPOSITORY ─────────────────────────────────────────── */}
            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, letterSpacing: 2, mb: 3, display: 'block' }}>
                SUPPLEMENTARY REPOSITORY
            </Typography>
            <Paper sx={{
                p: 6,
                bgcolor: binThemeTokens.softCanvas,
                border: '1px dashed #E5E7EB',
                borderRadius: 8,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                '&:hover': { borderColor: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.02) }
            }}>
                <Box sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.1), width: 'fit-content', borderRadius: '50%', margin: '0 auto 24px auto' }}>
                    <Lock size={32} color={binThemeTokens.gold} />
                </Box>
                <Typography variant="h5" fontWeight="950" color={binThemeTokens.textPrimary}>Referral Supporting Evidence</Typography>
                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, maxWidth: 400, margin: '12px auto 32px auto', fontWeight: 700 }}>
                    Upload NDAs, signed mandates, or valuation reports. All files are encrypted at rest and accessible only by Sovereign Admin.
                </Typography>
                <Stack direction="row" spacing={2} justifyContent="center">
                    <Button
                        variant="contained"
                        startIcon={uploading === 'evidence' ? <CircularProgress size={16} sx={{ color: '#000' }} /> : <FileUp size={18} />}
                        onClick={() => handleUpload('evidence')}
                        disabled={!!uploading}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 6, py: 1.5, borderRadius: 3 }}
                    >
                        {uploading === 'evidence' ? 'UPLOADING...' : 'INITIALIZE UPLOAD'}
                    </Button>
                </Stack>
            </Paper>

            <Box sx={{ mt: 6, p: 3, bgcolor: alpha('#3b82f6', 0.05), borderRadius: 4, border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Info size={24} color="#3b82f6" />
                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, fontWeight: 700 }}>
                    Security Protocol: Files are scanned for malware upon upload. Sensitive personal information is redacted automatically where necessary for institutional compliance.
                </Typography>
            </Box>

            <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                style={{ display: 'none' }}
                onChange={handleFileSelected}
            />

            <Snackbar open={!!uploadError} autoHideDuration={7000} onClose={() => setUploadError(null)}>
                <Alert severity="error" onClose={() => setUploadError(null)} sx={{ fontWeight: 700 }}>
                    {uploadError}
                </Alert>
            </Snackbar>
        </BrokerPageFrame>
    );
}
