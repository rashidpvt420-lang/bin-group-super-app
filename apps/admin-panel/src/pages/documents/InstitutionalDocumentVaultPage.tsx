import React, { useEffect, useState } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Container, Paper,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography
} from '@mui/material';
import { Download, ShieldCheck } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';

type VaultArtifact = {
    artifactId: string;
    sourceCollection: string;
    sourceId: string;
    category: string;
    title: string;
    status: string;
    propertyId?: string | null;
    contractId?: string | null;
    paymentId?: string | null;
    storagePath?: string | null;
};

const InstitutionalDocumentVaultPage: React.FC = () => {
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
                console.error('[AdminDocumentVault] load failed', err);
                if (!cancelled) setError(err?.message || 'Unable to load authorized document review surfaces.');
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
            if (!url) throw new Error('Authorized file URL was not returned.');
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err: any) {
            setError(err?.message || 'Document access failed.');
        } finally {
            setOpening(null);
        }
    };

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: '#020617', py: 4 }} data-testid="admin-unified-document-vault">
            <Container maxWidth="xl">
                <Box sx={{ mb: 5 }}>
                    <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950, letterSpacing: 4 }}>
                        ROLE-AUTHORIZED REVIEW SURFACE
                    </Typography>
                    <Typography variant="h3" fontWeight="900" color="white">
                        Unified Document Vault
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.55)', mt: 1 }}>
                        Records are linked by source collection and document ID. This screen only receives collections permitted for the current Admin/HR/Finance/Operations role.
                    </Typography>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

                <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 5 }}>
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <ShieldCheck color="#DAA520" /> AUTHORIZED DOCUMENTS
                    </Typography>

                    {loading ? (
                        <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}><CircularProgress sx={{ color: '#DAA520' }} /></Box>
                    ) : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>DOCUMENT</TableCell>
                                        <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>SOURCE ID</TableCell>
                                        <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>CATEGORY</TableCell>
                                        <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>STATUS</TableCell>
                                        <TableCell align="right" sx={{ color: '#DAA520', fontWeight: 900 }}>FILE</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {documents.map((doc) => (
                                        <TableRow key={doc.artifactId} hover>
                                            <TableCell sx={{ color: '#FFF', fontWeight: 800 }}>{doc.title}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,.5)' }}>{doc.sourceCollection} · {doc.sourceId}</TableCell>
                                            <TableCell><Chip label={doc.category.replace(/_/g, ' ').toUpperCase()} size="small" /></TableCell>
                                            <TableCell><Chip label={doc.status || 'ACTIVE'} size="small" sx={{ color: '#10b981' }} /></TableCell>
                                            <TableCell align="right">
                                                <Button
                                                    size="small"
                                                    disabled={!doc.storagePath || opening === doc.artifactId}
                                                    onClick={() => void openDocument(doc.artifactId)}
                                                    sx={{ color: '#DAA520' }}
                                                >
                                                    {opening === doc.artifactId ? <CircularProgress size={16} color="inherit" /> : <Download size={16} />}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {documents.length === 0 && (
                                        <TableRow><TableCell colSpan={5} align="center" sx={{ color: 'rgba(255,255,255,.45)', py: 6 }}>No documents are authorized for this role yet.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>
            </Container>
        </Box>
    );
};

export default InstitutionalDocumentVaultPage;
