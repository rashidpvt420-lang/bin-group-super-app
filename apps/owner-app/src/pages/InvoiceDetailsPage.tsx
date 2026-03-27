// owner-app/src/pages/InvoiceDetailsPage.tsx
import React from 'react';
import { 
    Container, Paper, Typography, Box, Table, TableBody, 
    TableCell, TableContainer, TableHead, TableRow, Divider,
    Button, Stack, Chip, Grid
} from '@mui/material';
import { Download, Printer, ShieldCheck, FileText, Share2 } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';

export default function InvoiceDetailsPage() {
    // Mock Data for V1.4 Preview
    const invoice = {
        id: 'INV-2026-0034',
        date: '2026-03-24',
        dueDate: '2026-04-01',
        owner: 'Institutional Portfolio A',
        entity: 'UAE Ministry of Infrastructure',
        campus: 'Dubai East Education Cluster',
        ownerTrn: '100XXXXXXXXX003',
        region: 'Dubai East Cluster',
        integrityHash: 'a5c1e34b8e2f4d1c9a0b7d2e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a',
        property: 'Marina Heights Unit 2201',
        items: [
            { descEn: 'Institutional Management Fee', descAr: 'رسوم الإدارة المؤسسية', qty: 1, rate: 2500, total: 2500 },
            { descEn: 'Emergency Plumbing Resolution', descAr: 'إصلاح السباكة في حالات الطوارئ', qty: 1, rate: 450, total: 450 },
            { descEn: 'SLA Breach Credit (4hrs)', descAr: 'خصم انتهاك اتفاقية مستوى الخدمة', qty: 1, rate: -250, total: -250 },
        ]
    };

    const total = invoice.items.reduce((sum, item) => sum + item.total, 0);
    const vat = Math.round(total * 0.05);
    const finalTotal = total + vat;

    return (
        <Container maxWidth="lg" sx={{ py: 10 }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 3 }}>TAX INVOICE / فاتورة ضريبية</Typography>
                    <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.textPrimary, mt: 1 }}>{invoice.id}</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button 
                        startIcon={<Printer size={18} />} 
                        variant="outlined"
                        sx={{ color: binThemeTokens.textSecondary, borderColor: 'rgba(255,255,255,0.1)', px: 3 }}
                    >
                        PRINT
                    </Button>
                    <Button 
                        startIcon={<Download size={18} />} 
                        variant="contained" 
                        sx={{ 
                            background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', 
                            color: '#0B0B0C', 
                            fontWeight: 900,
                            px: 4
                        }}
                    >
                        EXPORT PDF
                    </Button>
                </Stack>
            </Box>

            <Paper sx={{ 
                p: 8, 
                bgcolor: '#0B0B0C', 
                borderRadius: 8, 
                border: '1px solid rgba(198, 167, 94, 0.2)',
                boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Watermark Logo */}
                <Box sx={{ 
                    position: 'absolute', top: 50, right: 50, opacity: 0.05, 
                    transform: 'rotate(-15deg) scale(2.5)', pointerEvents: 'none' 
                }}>
                    <Typography variant="h1" fontWeight="900" sx={{ color: binThemeTokens.gold }}>BIN</Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 10 }}>
                    <Box>
                        <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 1.5, letterSpacing: -1 }}>BIN-GROUP</Typography>
                        <Stack spacing={0.5}>
                            <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 700 }}>Institutional Asset Management Headquarters</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>Business Bay, One Central Tower, Dubai, UAE</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>TRN: 100345678900003</Typography>
                        </Stack>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>GENERATED DATE</Typography>
                        <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{invoice.date}</Typography>
                        <Box sx={{ mt: 3, p: 1, px: 2, bgcolor: 'rgba(255, 77, 77, 0.1)', borderRadius: 2, border: '1px solid rgba(255, 77, 77, 0.2)' }}>
                            <Typography variant="caption" sx={{ color: '#ff4d4d', fontWeight: 900 }}>DUE: {invoice.dueDate}</Typography>
                        </Box>
                    </Box>
                </Box>

                <Grid container spacing={8} sx={{ mb: 10 }}>
                    <Grid item xs={12} md={7}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mb: 2, letterSpacing: 2 }}>BILLED TO / فاتورة إلى</Typography>
                        <Typography variant="h5" fontWeight="900" sx={{ color: binThemeTokens.textPrimary, mb: 1 }}>{invoice.owner}</Typography>
                        <Typography variant="subtitle1" fontWeight="800" sx={{ color: binThemeTokens.goldLight }}>{invoice.entity}</Typography>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1 }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{invoice.region}</Typography>
                            <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: binThemeTokens.gold, opacity: 0.3 }} />
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{invoice.campus}</Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ mt: 2, color: binThemeTokens.textPrimary, opacity: 0.8 }}>{invoice.property}</Typography>
                        <Typography variant="caption" sx={{ mt: 1, display: 'block', fontWeight: 900, color: binThemeTokens.gold }}>TRN: {invoice.ownerTrn}</Typography>
                    </Grid>
                    <Grid item xs={12} md={5} sx={{ textAlign: 'right' }}>
                        <Box sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.03)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block', mb: 1 }}>PROTOCOL SUMMARY</Typography>
                            <Stack spacing={2}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>SETTLEMENT LAYER</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textPrimary, fontWeight: 900 }}>SOVEREIGN-AUDIT-1.4</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>COMPLIANCE</Typography>
                                    <Chip label="UAE-VAT-CERTIFIED" size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 900, bgcolor: 'rgba(198, 167, 94, 0.1)', color: binThemeTokens.gold }} />
                                </Box>
                            </Stack>
                        </Box>
                    </Grid>
                </Grid>

                <TableContainer>
                    <Table>
                        <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                            <TableRow>
                                <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900, borderBottom: '1px solid rgba(198, 167, 94, 0.2)' }}>DESCRIPTION / الوصف</TableCell>
                                <TableCell align="right" sx={{ color: binThemeTokens.gold, fontWeight: 900, borderBottom: '1px solid rgba(198, 167, 94, 0.2)' }}>TOTAL / الإجمالي</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {invoice.items.map((item, i) => (
                                <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                    <TableCell sx={{ py: 4, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{item.descEn}</Typography>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.5 }}>{item.descAr}</Typography>
                                    </TableCell>
                                    <TableCell align="right" sx={{ py: 4, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Typography variant="h6" fontWeight="900" sx={{ color: item.total < 0 ? '#ff4d4d' : binThemeTokens.textPrimary }}>
                                            {item.total < 0 ? `-${Math.abs(item.total).toLocaleString()}` : item.total.toLocaleString()} AED
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>

                <Box sx={{ mt: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <Box sx={{ minWidth: 350 }}>
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>SUBTOTAL</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 700 }}>{total.toLocaleString()} AED</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>VAT (5%)</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 700 }}>{vat.toLocaleString()} AED</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(198, 167, 94, 0.2)', my: 1 }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>TOTAL DUE / إجمالي المستحق</Typography>
                                <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>{finalTotal.toLocaleString()} AED</Typography>
                            </Box>
                        </Stack>
                    </Box>
                </Box>

                <Box sx={{ 
                    mt: 12, p: 4, borderRadius: 5, bgcolor: 'rgba(198, 167, 94, 0.05)', 
                    border: '1px solid rgba(198, 167, 94, 0.1)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between' 
                }}>
                    <Stack direction="row" spacing={3} alignItems="center">
                        <Box sx={{ width: 50, height: 50, borderRadius: '50%', bgcolor: 'rgba(198, 167, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShieldCheck color={binThemeTokens.gold} size={28} />
                        </Box>
                        <Box>
                            <Typography variant="subtitle2" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: 0.5 }}>SHA-256 INTEGRITY HANDSHAKE</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>Verified by BIN-OS Institutional Audit Engine 1.4</Typography>
                        </Box>
                    </Stack>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: binThemeTokens.textSecondary, display: 'block', mb: 0.5 }}>MISSION-CRITICAL HASH</Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 900, color: binThemeTokens.goldLight, letterSpacing: 1 }}>{invoice.integrityHash.slice(0, 32).toUpperCase()}...</Typography>
                    </Box>
                </Box>
            </Paper>
            
            <Box sx={{ mt: 6, display: 'flex', gap: 4, justifyContent: 'center' }}>
                <Button startIcon={<Share2 size={18} />} sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>SHARE LEDGER</Button>
                <Button startIcon={<FileText size={18} />} sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>VIEW TRANSACTION LOG</Button>
            </Box>
        </Container>
    );
}
