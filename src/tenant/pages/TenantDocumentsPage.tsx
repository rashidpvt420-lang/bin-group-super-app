import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Stack, Button, CircularProgress, Chip, alpha, Tab, Tabs } from '@mui/material';
import { db, collection, query, where, getDocs, limit, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { FileText, Download, FileCheck, Info, Eye, ClipboardList } from 'lucide-react';
import SafeIcon from '../../components/SafeIcon';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const documentUrlOf = (doc: any) => doc?.downloadUrl || doc?.pdfUrl || doc?.fileUrl || doc?.documentUrl || doc?.signedPdfUrl || doc?.leasePdfUrl || doc?.invoicePdfUrl || doc?.receiptUrl || doc?.url || '';
const documentNameOf = (doc: any) => String(doc?.title || doc?.name || doc?.fileName || doc?.type || 'BIN-GROUP-tenant-document').replace(/[^a-z0-9._-]/gi, '_');
const dateOf = (doc: any) => doc?.date || doc?.createdAt?.toDate?.() || (doc?.createdAt?.seconds ? new Date(doc.createdAt.seconds * 1000) : null) || doc?.uploadedAt?.toDate?.() || (doc?.uploadedAt?.seconds ? new Date(doc.uploadedAt.seconds * 1000) : null) || new Date();

const openDocument = (doc: any) => {
    const url = documentUrlOf(doc);
    if (!url) {
        alert('This document file is not available yet. Please contact BIN GROUP support.');
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
};

const downloadDocument = async (doc: any) => {
    const url = documentUrlOf(doc);
    if (!url) {
        alert('This document file is not available yet. Please contact BIN GROUP support.');
        return;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = documentNameOf(doc).endsWith('.pdf') ? documentNameOf(doc) : `${documentNameOf(doc)}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
        console.warn('[TenantDocuments] direct download failed, opening file instead:', error);
        openDocument(doc);
    }
};

export default function TenantDocumentsPage() {
    const { user } = useRole();
    const { tx, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [personalDocs, setPersonalDocs] = useState<any[]>([]);
    const [libraryDocs, setLibraryDocs] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState(0);
    const [propertyId, setPropertyId] = useState<string>('');

    // 1. Resolve tenant propertyId
    useEffect(() => {
        async function resolveProperty() {
            if (!user?.uid) return;
            try {
                let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid), limit(1)));
                if (unitSnap.empty && user.email) {
                    unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', normalizeEmail(user.email)), limit(1)));
                }
                if (!unitSnap.empty) {
                    setPropertyId(unitSnap.docs[0].data().propertyId || '');
                } else {
                    const contractSnap = await getDocs(query(collection(db, 'contracts'), where('tenantId', '==', user.uid), limit(1)));
                    if (!contractSnap.empty) {
                        setPropertyId(contractSnap.docs[0].data().propertyId || '');
                    }
                }
            } catch (err) {
                console.error('Failed to resolve propertyId:', err);
            }
        }
        resolveProperty();
    }, [user]);

    // 2. Fetch personal documents
    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        const fetchPersonal = async () => {
            try {
                const seen = new Map<string, any>();
                const addDocs = (items: any[]) => items.forEach((item) => seen.set(item.id, item));

                // Query tenantId
                const snap1 = await getDocs(query(collection(db, 'tenantDocuments'), where('tenantId', '==', user.uid), limit(50)));
                addDocs(snap1.docs.map(d => ({ id: d.id, ...d.data() })));

                // Query tenantUid
                const snap2 = await getDocs(query(collection(db, 'tenantDocuments'), where('tenantUid', '==', user.uid), limit(50)));
                addDocs(snap2.docs.map(d => ({ id: d.id, ...d.data() })));

                if (user.email) {
                    const email = normalizeEmail(user.email);
                    const snap3 = await getDocs(query(collection(db, 'tenantDocuments'), where('tenantEmail', '==', email), limit(50)));
                    addDocs(snap3.docs.map(d => ({ id: d.id, ...d.data() })));
                }

                // General tenant documents
                const snapGen = await getDocs(query(collection(db, 'tenantDocuments'), where('tenantId', '==', 'ALL'), limit(50)));
                addDocs(snapGen.docs.map(d => ({ id: d.id, ...d.data() })));

                setPersonalDocs(Array.from(seen.values()));
            } catch (err) {
                console.error('Personal docs fetch failed:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchPersonal();
    }, [user?.uid, user?.email]);

    // 3. Fetch Document Library (Shared property templates)
    useEffect(() => {
        if (!propertyId) return;

        const q = query(
            collection(db, 'documentLibrary'),
            where('propertyId', '==', propertyId),
            where('active', '==', true)
        );

        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter((d: any) => d.audience === 'tenant' || d.audience === 'all');
            setLibraryDocs(list);
        }, (err) => {
            console.warn('[TenantDocuments] documentLibrary listener failed:', err);
        });

        return () => unsub();
    }, [propertyId]);

    const displayedDocs = activeTab === 0 ? personalDocs : libraryDocs;

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1, textTransform: 'uppercase' }}>
                {tx('tenant.documents.title', 'Documents & Vault')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', mb: 4 }}>
                {tx('tenant.documents.desc', 'Securely view and download leases, receipts, official forms, rules, and community documents.')}
            </Typography>

            <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.08)', mb: 4 }}>
                <Tabs 
                    value={activeTab} 
                    onChange={(e, val) => setActiveTab(val)}
                    textColor="inherit"
                    TabIndicatorProps={{ sx: { bgcolor: binThemeTokens.gold } }}
                    sx={{
                        '& .MuiTab-root': { fontWeight: 900, fontSize: '0.8rem', letterSpacing: 1 },
                        '& .Mui-selected': { color: binThemeTokens.gold }
                    }}
                >
                    <Tab label={tx('tenant.documents.personal', 'PERSONAL VAULT')} />
                    <Tab label={tx('tenant.documents.library', 'SHARED LIBRARY & FORMS')} />
                </Tabs>
            </Box>

            <Grid container spacing={3}>
                {displayedDocs.map(doc => {
                    const hasFile = Boolean(documentUrlOf(doc));
                    return (
                        <Grid item xs={12} md={6} key={doc.id}>
                            <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
                                    <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                                        <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                                            {activeTab === 0 ? <SafeIcon icon={FileText} size={24} style={{ color: binThemeTokens.gold }} /> : <SafeIcon icon={ClipboardList} size={24} style={{ color: binThemeTokens.gold }} />}
                                        </Box>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography variant="body1" fontWeight="900" color="#FFF" noWrap>{doc.title || doc.name || 'Tenant Document'}</Typography>
                                            <Typography variant="caption" color="textSecondary" display="block">{doc.description || `Added: ${new Date(dateOf(doc)).toLocaleDateString()}`}</Typography>
                                            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                                <Chip size="small" label={doc.category || 'DOCUMENT'} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.65)', fontWeight: 900, fontSize: '0.65rem' }} />
                                                <Chip size="small" label={hasFile ? 'READY' : 'PENDING FILE'} sx={{ bgcolor: alpha(hasFile ? '#10b981' : '#f59e0b', 0.12), color: hasFile ? '#10b981' : '#f59e0b', fontWeight: 900, fontSize: '0.65rem' }} />
                                            </Stack>
                                        </Box>
                                    </Stack>
                                    <Stack direction="row" spacing={1} sx={{ alignSelf: { xs: 'flex-end', sm: 'center' }, mt: { xs: 2, sm: 0 } }}>
                                        <Button variant="outlined" size="small" startIcon={<SafeIcon icon={Eye} size={15} />} disabled={!hasFile} onClick={() => openDocument(doc)} sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.4), fontWeight: 900 }}>
                                            VIEW
                                        </Button>
                                        <Button variant="contained" size="small" startIcon={hasFile ? <SafeIcon icon={Download} size={15} /> : <SafeIcon icon={FileCheck} size={15} />} disabled={!hasFile} onClick={() => downloadDocument(doc)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                            DOWNLOAD
                                        </Button>
                                    </Stack>
                                </Stack>
                            </Paper>
                        </Grid>
                    );
                })}
            </Grid>

            {displayedDocs.length === 0 && (
                <Paper sx={{ p: 5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
                    <Typography variant="body1" color="textSecondary">
                        {tx('tenant.documents.empty', 'No documents available in this folder.')}
                    </Typography>
                </Paper>
            )}
        </Box>
    );
}
