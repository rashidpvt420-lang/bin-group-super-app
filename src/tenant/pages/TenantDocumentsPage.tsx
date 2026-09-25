import React, { useState, useEffect } from 'react';
import { Alert, Box, Typography, Paper, Grid, Stack, Button, CircularProgress, Chip, alpha } from '@mui/material';
import { db, collection, query, where, getDocs, limit } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { FileText, Download, FileCheck, Info, Eye } from 'lucide-react';

import DocumentCenterCard from '../../components/DocumentCenterCard';

async function queryDocs(field: string, value?: string) {
    if (!value) return [] as any[];
    const snap = await getDocs(query(collection(db, 'tenantDocuments'), where(field, '==', value), limit(50)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function queryGeneralDocs() {
    const snap = await getDocs(query(collection(db, 'tenantDocuments'), where('tenantId', '==', 'ALL'), limit(50)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export default function TenantDocumentsPage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [documents, setDocuments] = useState<any[]>([]);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        let cancelled = false;
        const fetchDocuments = async () => {
            if (!user?.uid) {
                setLoading(false);
                return;
            }
            setLoadError('');
            try {
                const seen = new Map<string, any>();
                const addDocs = (items: any[]) => items.forEach((item) => seen.set(item.id, item));

                addDocs(await queryDocs('tenantId', user.uid));
                addDocs(await queryDocs('tenantUid', user.uid));
                if (user.email) {
                    const email = String(user.email).trim().toLowerCase();
                    addDocs(await queryDocs('tenantEmail', email));
                    addDocs(await queryDocs('recipientEmail', email));
                }
                addDocs(await queryGeneralDocs());

                if (!cancelled) setDocuments(Array.from(seen.values()));
            } catch (err: any) {
                const code = String(err?.code || '').toLowerCase();
                console.error('[TenantDocuments] document lookup failed:', { code });
                if (!cancelled) {
                    setDocuments([]);
                    setLoadError(
                        code.includes('permission-denied')
                            ? 'Documents could not be loaded because access was denied. Refresh your session or contact BIN GROUP Operations.'
                            : 'Documents could not be loaded. This is a loading failure, not confirmation that your document vault is empty.',
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchDocuments();
        return () => { cancelled = true; };
    }, [user?.uid, user?.email]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>Documents & Notices</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', mb: 4 }}>Download your lease, invoices, receipts, notices, service documents, and building files shared by BIN GROUP.</Typography>

            {loadError && <Alert severity="error" data-testid="tenant-documents-load-failed" sx={{ mb: 3 }}>{loadError}</Alert>}

            <Grid container spacing={3}>
                {documents.map(doc => (
                    <Grid item xs={12} md={6} key={doc.id}>
                        <DocumentCenterCard doc={doc} themeColor={binThemeTokens.gold} />
                    </Grid>
                ))}
            </Grid>
            {!loadError && documents.length === 0 && (
                <Paper sx={{ p: 5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
                    <Typography variant="body1" color="textSecondary">
                        No downloadable documents available yet.
                    </Typography>
                </Paper>
            )}
        </Box>
    );
}
