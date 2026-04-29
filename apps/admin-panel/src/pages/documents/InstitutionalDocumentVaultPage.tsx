import React from 'react';
import { 
    Container, Typography, Box, Paper, Grid, Stack, Button, 
    Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    alpha
} from '@mui/material';
import { 
    Landmark
} from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { Download, ShieldCheck } from 'lucide-react';

const InstitutionalDocumentVaultPage: React.FC = () => {
    const complianceDocs = [
        { name: 'Trade License 2026', type: 'LICENSE', status: 'VERIFIED', expiry: '2026-12-31' },
        { name: 'VAT Registration UAE', type: 'TAX', status: 'VERIFIED', expiry: 'N/A' },
        { name: 'SIRA Security Certificate', type: 'COMPLIANCE', status: 'VERIFIED', expiry: '2026-06-15' },
        { name: 'DCD Maintenance Approval', type: 'COMPLIANCE', status: 'VERIFIED', expiry: '2027-01-10' },
        { name: 'Professional Indemnity Insurance', type: 'INSURANCE', status: 'ACTIVE', expiry: '2026-11-20' }
    ];

    const handleExportCapability = () => {
        alert("Exporting Institutional Capability Statement (PDF)...");
    };

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: '#020617', py: 4 }}>
            <Container maxWidth="xl">
                <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950, letterSpacing: 4 }}>
                            INSTITUTIONAL ASSETS
                        </Typography>
                        <Typography variant="h3" fontWeight="900" color="white">
                            Document <Box component="span" sx={{ color: '#DAA520' }}>Vault</Box>
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={2}>
                        <Button variant="contained" onClick={handleExportCapability} startIcon={<Download />} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>
                            CAPABILITY STATEMENT
                        </Button>
                    </Stack>
                </Box>

                <Grid container spacing={4}>
                    {/* COMPLIANCE VAULT */}
                    <Grid item xs={12}>
                        <Paper sx={{ p: 4, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <ShieldCheck color="#DAA520" /> CORPORATE COMPLIANCE VAULT
                            </Typography>
                            <TableContainer>
                                <Table>
                                    <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                        <TableRow>
                                            <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>DOCUMENT NAME</TableCell>
                                            <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>CATEGORY</TableCell>
                                            <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>EXPIRY</TableCell>
                                            <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>STATUS</TableCell>
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
                                <Landmark color="#DAA520" /> GOVT COMPLIANCE
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>Institutional ready for all UAE Federal and Municipal portals.</Typography>
                            <Button variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)' }}>
                                VIEW CERTIFICATIONS
                            </Button>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default InstitutionalDocumentVaultPage;
