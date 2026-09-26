import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Container, Grid, Paper, Stack, Typography } from '@mui/material';
import { FileText, FolderOpen, ShieldCheck } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type VaultArtifact = {
    artifactId: string;
    sourceCollection: string;
    sourceId: string;
    category: string;
    title: string;
    status: string;
    storagePath?: string | null;
};

export default function OwnerDocumentsPage() {
    const { tx, isRTL } = useLanguage();
    const [documents, setDocuments] = useState<VaultArtifact[]>([]);
    const [loading, setLoading] = useState(true);
    const [opening, setOpening] = useState<string | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const call = httpsCallable(functions, 'listUnifiedDocumentVault');
                const response: any = await call({});
                if (!cancelled) setDocuments(Array.isArray(response?.data?.artifacts) ? response.data.artifacts : []);
            } catch (err: any) {
                console.error('[OwnerDocuments] unified vault load failed', err);
                if (!cancelled) setError(err?.message || 'Unable to load document vault.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => { cancelled = true; };
    }, []);

    const openDocument = async (artifactId: string) => {
        setOpening(artifactId);
        setError('');
        try {
            const call = httpsCallable(functions, 'getUnifiedDocumentFile');
            const response: any = await call({ artifactId });
            const url = String(response?.data?.url || '').trim();
            if (!url) throw new Error('Authorized document file is unavailable.');
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err: any) {
            setError(err?.message || 'Unable to open document.');
        } finally {
            setOpening(null);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    }

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }} data-testid="owner-unified-document-vault">
            <Box sx={{ mb: 5 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                    {tx('docs.vault_subtitle', 'SECURE DIGITAL VAULT')}
                </Typography>
                <Typography variant="h3" fontWeight="950" color="#FFF">
                    {tx('docs.title', 'Owner Document Vault')}
                </Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">
                    Contracts, invoices, property reports and inspection records are linked by canonical record IDs. File access is granted only after server authorization.
                </Typography>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {documents.length === 0 ? (
                <Paper sx={{ p: 7, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)' }}>
                    <FolderOpen size={48} color={binThemeTokens.gold} />
                    <Typography sx={{ mt: 2, color: 'rgba(255,255,255,.55)', fontWeight: 900 }}>NO AUTHORIZED DOCUMENTS YET</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {documents.map((doc) => (
                        <Grid item xs={12} md={6} lg={4} key={doc.artifactId}>
                            <Paper sx={{ p: 3, bgcolor: 'rgba(22,22,24,.65)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 4 }}>
                                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                    <FileText size={22} color={binThemeTokens.gold} />
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography color="#FFF" fontWeight={900} noWrap>{doc.title}</Typography>
                                        <Typography variant="caption" color="textSecondary">{doc.sourceCollection} · {doc.sourceId}</Typography>
                                    </Box>
                                </Stack>
                                <Stack direction="row" spacing={1} sx={{ my: 2.5 }}>
                                    <Chip size="small" label={doc.category.replace(/_/g, ' ').toUpperCase()} />
                                    <Chip size="small" icon={<ShieldCheck size={12} />} label={doc.status || 'ACTIVE'} />
                                </Stack>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    disabled={!doc.storagePath || opening === doc.artifactId}
                                    onClick={() => void openDocument(doc.artifactId)}
                                    sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900 }}
                                >
                                    {opening === doc.artifactId ? <CircularProgress size={18} color="inherit" /> : doc.storagePath ? 'OPEN AUTHORIZED FILE' : 'METADATA ONLY'}
                                </Button>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Container>
    );
}
