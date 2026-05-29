import React, { useState, useEffect } from 'react';
import {
    Grid, Typography, Box, Paper, Button,
    Chip, alpha, Stack, IconButton, TextField, InputAdornment, Alert
} from '@mui/material';
import {
    Landmark, Download, ShieldCheck, FileText,
    Search, Share2, MoreVertical, UploadCloud
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';
import LaunchStatusBanner from '../../components/LaunchStatusBanner';
import { comingSoon, filterLaunchRecords } from '../../utils/launchDataHygiene';

interface VaultDocument {
    id: string;
    name: string;
    category: string;
    expiryDate?: any;
    status: 'verified' | 'pending' | 'expired';
    fileUrl?: string;
    uploadedAt: any;
}

export default function InstitutionalDocumentVaultPage() {
    const [documents, setDocuments] = useState<VaultDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('ALL');
    const [error, setError] = useState('');

    const categories = ['ALL', 'LEGAL', 'FINANCIAL', 'TECHNICAL', 'COMPLIANCE', 'ASSET'];

    useEffect(() => {
        const q = query(collection(db, 'vault'), orderBy('uploadedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as VaultDocument[];
            setDocuments(filterLaunchRecords(fetched));
            setLoading(false);
        }, (err) => {
            console.error('Vault Fetch Error:', err);
            setError(err?.message || 'Unable to load vault documents.');
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const filteredDocs = documents.filter((d) => {
        const matchesCategory = activeCategory === 'ALL' || String(d.category || '').toUpperCase() === activeCategory;
        const matchesSearch = !search || String(d.name || '').toLowerCase().includes(search.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const handleDownload = (url?: string) => {
        if (!url) {
            comingSoon('This document has no connected file URL yet. Upload/storage workflow must be completed first.');
            return;
        }
        window.open(url, '_blank');
    };

    return (
        <AdminPageFrame
            title="Institutional Vault"
            subtitle="Secure document repository. Empty and test-data states are now launch-safe."
            loading={loading}
            breadcrumbs={[{ label: 'Document Vault' }]}
            actions={
                <Button variant="contained" startIcon={<UploadCloud size={18} />} onClick={() => comingSoon('Document upload is locked until Firebase Storage rules, hash logging and owner/property linking are connected.')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                    Upload Document
                </Button>
            }
        >
            <Stack spacing={4}>
                <LaunchStatusBanner
                    title="Vault actions are setup-protected"
                    message="Upload, share, hash verification and portal sync are blocked until storage, permissions and Audit Shield logging are connected."
                />

                {error && <Alert severity="warning">{error}</Alert>}

                <Paper sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                size="small"
                                placeholder="Search vault documents..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><Search size={18} color="rgba(255,255,255,0.3)" /></InputAdornment>,
                                    sx: { borderRadius: 3, bgcolor: '#000', border: '1px solid rgba(255,255,255,0.05)', color: '#fff' }
                                }}
                            />
                        </Grid>
                        <Grid item xs={12} md={8}>
                            <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
                                {categories.map(cat => (
                                    <Chip
                                        key={cat}
                                        label={cat}
                                        onClick={() => setActiveCategory(cat)}
                                        sx={{ borderRadius: 2, fontWeight: 900, fontSize: '0.65rem', bgcolor: activeCategory === cat ? binThemeTokens.gold : 'rgba(255,255,255,0.05)', color: activeCategory === cat ? '#000' : '#FFF' }}
                                    />
                                ))}
                            </Stack>
                        </Grid>
                    </Grid>
                </Paper>

                {filteredDocs.length === 0 ? (
                    <Paper sx={{ p: { xs: 4, md: 8 }, textAlign: 'center', borderRadius: 6, bgcolor: 'rgba(255,255,255,0.015)', border: '1px dashed rgba(255,255,255,0.12)' }}>
                        <FileText size={54} color="rgba(255,255,255,0.18)" />
                        <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mt: 2 }}>No documents uploaded yet</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', mt: 1, maxWidth: 620, mx: 'auto' }}>
                            Production documents will appear here only after they are uploaded, linked to an owner/property, hashed, and logged in Audit Shield. Demo/test rows are hidden from this launch view.
                        </Typography>
                    </Paper>
                ) : (
                    <Grid container spacing={3}>
                        {filteredDocs.map((doc) => (
                            <Grid item xs={12} sm={6} md={4} lg={3} key={doc.id}>
                                <Paper sx={{ p: 3, borderRadius: 5, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', transition: 'transform 0.2s ease', '&:hover': { transform: 'translateY(-4px)', borderColor: alpha(binThemeTokens.gold, 0.3) } }}>
                                    <Stack spacing={2}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                            <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}><FileText size={24} color={binThemeTokens.gold} /></Box>
                                            <Chip label={String(doc.status || 'PENDING').toUpperCase()} size="small" sx={{ fontSize: '0.6rem', fontWeight: 950, bgcolor: doc.status === 'verified' ? alpha('#10b981', 0.1) : alpha('#f59e0b', 0.1), color: doc.status === 'verified' ? '#10b981' : '#f59e0b' }} />
                                        </Stack>
                                        <Box>
                                            <Typography variant="body1" fontWeight="950" noWrap color="#FFF">{String(doc.name || 'UNNAMED DOCUMENT').toUpperCase()}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{doc.category || 'GENERAL'} • {doc.uploadedAt?.toDate ? doc.uploadedAt.toDate().toLocaleDateString() : 'LEGACY'}</Typography>
                                        </Box>
                                        <Box sx={{ pt: 1, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                <IconButton size="small" onClick={() => handleDownload(doc.fileUrl)}><Download size={16} color={binThemeTokens.gold} /></IconButton>
                                                <IconButton size="small" onClick={() => comingSoon('Sharing is locked until recipient permissions and audit logs are connected.')}><Share2 size={16} color="rgba(255,255,255,0.3)" /></IconButton>
                                                <IconButton size="small" onClick={() => comingSoon('More document actions are setup-protected for launch.')}><MoreVertical size={16} color="rgba(255,255,255,0.3)" /></IconButton>
                                            </Stack>
                                        </Box>
                                    </Stack>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                )}

                <Grid container spacing={4}>
                    <Grid item xs={12} md={6}>
                        <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}><ShieldCheck color={binThemeTokens.gold} /> AUDIT SHIELD INTEGRATION</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>Each production document must be hashed and logged before live legal/evidence use.</Typography>
                            <Button variant="contained" onClick={() => comingSoon('Integrity checks will be enabled after document hashing is connected.')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>RUN INTEGRITY CHECK</Button>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}><Landmark color={binThemeTokens.gold} /> PORTAL CONNECTIVITY</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>Government portal integrations are not live. They are labelled as pending to avoid false launch claims.</Typography>
                            <Stack direction="row" spacing={2} flexWrap="wrap">
                                <Chip label="DLD: PENDING SETUP" size="small" sx={{ bgcolor: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 950 }} />
                                <Chip label="EJARI: PENDING SETUP" size="small" sx={{ bgcolor: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontWeight: 950 }} />
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>
            </Stack>
        </AdminPageFrame>
    );
}
