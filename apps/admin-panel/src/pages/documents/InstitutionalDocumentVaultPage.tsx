import React from 'react';
import {
    Container, Typography, Box, Paper, Grid, Stack, Button,
    Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    alpha
} from '@mui/material';
import {
    Landmark, ShieldCheck, Download
} from 'lucide-react';
import { useLanguage } from '@bin/shared';

const InstitutionalDocumentVaultPage: React.FC = () => {
    const { t, isRTL } = useLanguage();
    const complianceDocs = [
        { name: t('admin.document_vault.doc_trade_license'), type: t('admin.document_vault.type_license'), status: t('admin.document_vault.status_verified'), expiry: '2026-12-31' },
        { name: t('admin.document_vault.doc_vat_registration'), type: t('admin.document_vault.type_tax'), status: t('admin.document_vault.status_verified'), expiry: 'N/A' },
        { name: t('admin.document_vault.doc_sira_certificate'), type: t('admin.document_vault.type_compliance'), status: t('admin.document_vault.status_verified'), expiry: '2026-06-15' },
        { name: t('admin.document_vault.doc_dcd_approval'), type: t('admin.document_vault.type_compliance'), status: t('admin.document_vault.status_verified'), expiry: '2027-01-10' },
        { name: t('admin.document_vault.doc_indemnity_insurance'), type: t('admin.document_vault.type_insurance'), status: t('admin.document_vault.status_active'), expiry: '2026-11-20' }
    ];

    const handleExportCapability = () => {
        alert(t('admin.document_vault.exporting_capability_statement'));
    };

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: '#020617', py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Container maxWidth="xl">
                <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950, letterSpacing: 4 }}>
                            {t('admin.document_vault.eyebrow')}
                        </Typography>
                        <Typography variant="h3" fontWeight="900" color="white">
                            {t('admin.document_vault.page_title_prefix')} <Box component="span" sx={{ color: '#DAA520' }}>{t('admin.document_vault.page_title_highlight')}</Box>
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={2}>
                        <Button variant="contained" onClick={handleExportCapability} startIcon={<Download />} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>
                            {t('admin.document_vault.capability_statement_button')}
                        </Button>
                    </Stack>
                </Box>

                <Grid container spacing={4}>
                    {/* COMPLIANCE VAULT */}
                    <Grid item xs={12}>
                        <Paper sx={{ p: 4, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <ShieldCheck color="#DAA520" /> {t('admin.document_vault.compliance_vault_title')}
                            </Typography>
                            <TableContainer>
                                <Table>
                                    <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                        <TableRow>
                                            <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.document_vault.col_document_name')}</TableCell>
                                            <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.document_vault.col_category')}</TableCell>
                                            <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.document_vault.col_expiry')}</TableCell>
                                            <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.document_vault.col_status')}</TableCell>
                                            <TableCell align="right"></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {complianceDocs.map((doc, i) => (
                                            <TableRow key={i} hover>
                                                <TableCell sx={{ color: '#FFF', fontWeight: 700 }}>{doc.name}</TableCell>
                                                <TableCell><Chip label={doc.type} size="small" variant="outlined" sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)' }} /></TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>{doc.expiry}</TableCell>
                                                <TableCell>
                                                    <Chip label={doc.status} size="small" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 900, fontSize: '0.65rem' }} />
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Button size="small" sx={{ color: '#DAA520' }}><Download size={16} /></Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <Paper sx={{ p: 4, bgcolor: alpha('#DAA520', 0.05), border: `1px solid #DAA520`, borderRadius: 6 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Landmark color="#DAA520" /> {t('admin.document_vault.govt_compliance_title')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>{t('admin.document_vault.govt_compliance_desc')}</Typography>
                            <Button variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}>
                                {t('admin.document_vault.view_certifications_button')}
                            </Button>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default InstitutionalDocumentVaultPage;
