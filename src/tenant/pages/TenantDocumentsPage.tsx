import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Stack, Button, CircularProgress, Chip, alpha } from '@mui/material';
import { db, collection, query, where, getDocs, limit } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { FileText, Download, FileCheck, Info, Eye } from 'lucide-react';

const FILE_UNAVAILABLE_MSG = {
    en: 'This document file is not available yet. Please contact BIN GROUP support.',
    ar: 'ملف هذا المستند غير متاح بعد. يرجى التواصل مع دعم بن جروب.',
};

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const documentUrlOf = (doc: any) => doc?.downloadUrl || doc?.pdfUrl || doc?.fileUrl || doc?.documentUrl || doc?.signedPdfUrl || doc?.leasePdfUrl || doc?.invoicePdfUrl || doc?.receiptUrl || doc?.url || '';
const documentNameOf = (doc: any) => String(doc?.title || doc?.name || doc?.fileName || doc?.type || 'BIN-GROUP-tenant-document').replace(/[^a-z0-9._-]/gi, '_');
const dateOf = (doc: any) => doc?.date || doc?.createdAt?.toDate?.() || (doc?.createdAt?.seconds ? new Date(doc.createdAt.seconds * 1000) : null) || doc?.uploadedAt?.toDate?.() || (doc?.uploadedAt?.seconds ? new Date(doc.uploadedAt.seconds * 1000) : null) || new Date();

const openDocument = (doc: any, unavailableMsg = FILE_UNAVAILABLE_MSG.en) => {
    const url = documentUrlOf(doc);
    if (!url) {
        alert(unavailableMsg);
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
};

const downloadDocument = async (doc: any, unavailableMsg = FILE_UNAVAILABLE_MSG.en) => {
    const url = documentUrlOf(doc);
    if (!url) {
        alert(unavailableMsg);
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
        openDocument(doc, unavailableMsg);
    }
};

async function queryDocs(field: string, value?: string) {
    if (!value) return [] as any[];
    try {
        const snap = await getDocs(query(collection(db, 'tenantDocuments'), where(field, '==', value), limit(50)));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.warn(`[TenantDocuments] tenantDocuments.${field} lookup failed:`, error);
        return [] as any[];
    }
}

async function queryGeneralDocs() {
    try {
        const snap = await getDocs(query(collection(db, 'tenantDocuments'), where('tenantId', '==', 'ALL'), limit(50)));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.warn('[TenantDocuments] tenant general docs lookup failed:', error);
        return [] as any[];
    }
}

export default function TenantDocumentsPage() {
    const { user } = useRole();
    const { lang, isRTL } = useLanguage();
    const label = (en: string, ar: string) => (lang === 'ar' ? ar : en);
    const unavailableMsg = lang === 'ar' ? FILE_UNAVAILABLE_MSG.ar : FILE_UNAVAILABLE_MSG.en;
    const [loading, setLoading] = useState(true);
    const [documents, setDocuments] = useState<any[]>([]);

    useEffect(() => {
        let cancelled = false;
        const fetchDocuments = async () => {
            if (!user?.uid) {
                setLoading(false);
                return;
            }
            try {
                const seen = new Map<string, any>();
                const addDocs = (items: any[]) => items.forEach((item) => seen.set(item.id, item));

                addDocs(await queryDocs('tenantId', user.uid));
                addDocs(await queryDocs('tenantUid', user.uid));
                if (user.email) {
                    const email = normalizeEmail(user.email);
                    addDocs(await queryDocs('tenantEmail', email));
                    addDocs(await queryDocs('recipientEmail', email));
                }
                addDocs(await queryGeneralDocs());

                if (!cancelled) setDocuments(Array.from(seen.values()));
            } catch (err) {
                console.error('Docs fetch failed:', err);
                if (!cancelled) setDocuments([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchDocuments();
        return () => { cancelled = true; };
    }, [user?.uid, user?.email]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{label('Documents & Notices', 'المستندات والإشعارات')}</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', mb: 4 }}>{label('Download your lease, invoices, receipts, notices, service documents, and building files shared by BIN GROUP.', 'نزّل عقد الإيجار والفواتير والإيصالات والإشعارات ومستندات الخدمة وملفات المبنى التي تشاركها بن جروب.')}</Typography>

            <Grid container spacing={3}>
                {documents.map(doc => {
                    const hasFile = Boolean(documentUrlOf(doc));
                    return (
                    <Grid item xs={12} md={6} key={doc.id}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
                                <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                                    <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                                        {doc.type === 'NOTICE' ? <Info size={24} color={binThemeTokens.gold} /> : <FileText size={24} color={binThemeTokens.gold} />}
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="body1" fontWeight="900" color="#FFF" noWrap>{doc.title || doc.name || label('Tenant Document', 'مستند المستأجر')}</Typography>
                                        <Typography variant="caption" color="textSecondary">{label('Added', 'أُضيف')}: {new Date(dateOf(doc)).toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE')}</Typography>
                                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                            <Chip size="small" label={doc.type || doc.category || label('DOCUMENT', 'مستند')} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.65)', fontWeight: 900 }} />
                                            <Chip size="small" label={hasFile ? label('READY', 'جاهز') : label('PENDING FILE', 'بانتظار الملف')} sx={{ bgcolor: alpha(hasFile ? '#10b981' : '#f59e0b', 0.12), color: hasFile ? '#10b981' : '#f59e0b', fontWeight: 900 }} />
                                        </Stack>
                                    </Box>
                                </Stack>
                                <Stack direction="row" spacing={1}>
                                    <Button variant="outlined" size="small" startIcon={<Eye size={15} />} disabled={!hasFile} onClick={() => openDocument(doc, unavailableMsg)} sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.4), fontWeight: 900 }}>
                                        {label('VIEW', 'عرض')}
                                    </Button>
                                    <Button variant="contained" size="small" startIcon={hasFile ? <Download size={15} /> : <FileCheck size={15} />} disabled={!hasFile} onClick={() => downloadDocument(doc, unavailableMsg)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                        {label('DOWNLOAD', 'تنزيل')}
                                    </Button>
                                </Stack>
                            </Stack>
                        </Paper>
                    </Grid>
                );})}
            </Grid>
            {documents.length === 0 && (
                <Paper sx={{ p: 5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
                    <Typography variant="body1" color="textSecondary">
                        {label('No downloadable documents available yet.', 'لا توجد مستندات قابلة للتنزيل حتى الآن.')}
                    </Typography>
                </Paper>
            )}
        </Box>
    );
}
