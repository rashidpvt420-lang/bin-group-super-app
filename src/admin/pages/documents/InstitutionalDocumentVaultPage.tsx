import React, { useState, useEffect } from 'react';
import { 
    Grid, Typography, Box, Paper, Button, 
    Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    alpha, Stack, IconButton
} from '@mui/material';
import { 
    Landmark, Download, ShieldCheck, Eye, Trash2, Clock, FileText
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

interface VaultDocument {
    id: string;
    name: string;
    category: string;
    expiryDate?: any;
    status: 'verified' | 'pending' | 'expired';
    fileUrl: string;
    uploadedAt: any;
}

export default function InstitutionalDocumentVaultPage() {
    const { t, lang } = useLanguage();
    const [documents, setDocuments] = useState<VaultDocument[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'vault'), orderBy('uploadedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as VaultDocument[];
            setDocuments(fetched);
            setLoading(false);
        }, (error) => {
            console.error("Vault Fetch Error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleDownload = (url: string) => {
        window.open(url, '_blank');
    };

    return (
        <AdminPageFrame
            title={t('vault.title')}
            subtitle={t('vault.subtitle')}
            loading={loading}
            isEmpty={documents.length === 0}
            emptyMessage={t('vault.empty')}
            breadcrumbs={[{ label: t('vault.title') }]}
        >
            <Grid container spacing={4}>
                <Grid item xs={12}>
                    <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)' }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('dt.document').toUpperCase()}</TableCell>
                                    <TableCell>{t('fin.table.category').toUpperCase()}</TableCell>
                                    <TableCell>{t('common.expiry').toUpperCase()}</TableCell>
                                    <TableCell>{t('design.table.status').toUpperCase()}</TableCell>
                                    <TableCell align="right">{t('common.actions').toUpperCase()}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {documents.map((doc) => (
                                    <TableRow key={doc.id} hover>
                                        <TableCell>
                                            <Stack direction="row" spacing={2} alignItems="center">
                                                <Box sx={{ p: 1, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 1 }}>
                                                    <FileText size={18} color={binThemeTokens.gold} />
                                                </Box>
                                                <Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>{doc.name}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{t('onboarding.upload_date')}: {doc.uploadedAt?.toDate ? doc.uploadedAt.toDate().toLocaleDateString() : 'N/A'}</Typography>
                                                </Box>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={doc.category?.toUpperCase() || 'UNCLASSIFIED'} size="small" variant="outlined" sx={{ fontSize: '0.65rem', fontWeight: 900 }} />
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Clock size={12} color="rgba(255,255,255,0.3)" />
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                                    {doc.expiryDate?.toDate ? doc.expiryDate.toDate().toLocaleDateString() : 'PERPETUAL'}
                                                </Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={doc.status?.toUpperCase() || 'PENDING'} 
                                                size="small"
                                                color={doc.status === 'verified' ? 'success' : doc.status === 'expired' ? 'error' : 'warning'}
                                                sx={{ fontWeight: 900, fontSize: '0.65rem' }}
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                <IconButton size="small" onClick={() => handleDownload(doc.fileUrl)}>
                                                    <Download size={18} color={binThemeTokens.gold} />
                                                </IconButton>
                                                <IconButton size="small">
                                                    <Eye size={18} color="rgba(255,255,255,0.4)" />
                                                </IconButton>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <ShieldCheck color={binThemeTokens.gold} /> {t('admin.audit_shield').toUpperCase()}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>
                            {t('audit.subtitle')}
                        </Typography>
                        <Button variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                            {t('dt.view_certifications')}
                        </Button>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Landmark color={binThemeTokens.gold} /> {t('admin.compliance_vault').toUpperCase()}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>
                            Sovereign ready for all UAE Federal and Municipal portals.
                        </Typography>
                        <Button variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}>
                            {t('common.export_report')}
                        </Button>
                    </Paper>
                </Grid>
            </Grid>
        </AdminPageFrame>
    );
}

