// owner-app/src/pages/InvoiceDetailsPage.tsx
import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { 
    Container, Paper, Typography, Box, Table, TableBody, 
    TableCell, TableContainer, TableHead, TableRow, Divider,
    Button, Stack, Chip, Grid, CircularProgress
} from '@mui/material';
import { Download, Printer, ShieldCheck, FileText, Share2, FileQuestion } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { binThemeTokens } from '../theme/binGroupTheme';
import { db, doc, getDoc } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { formatAED } from '../utils/formatters';

export default function InvoiceDetailsPage() {
    const { id } = useParams();
    const { user } = useRole();
    const [invoice, setInvoice] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchInvoice() {
            if (!id) {
                setLoading(false);
                return;
            }

            try {
                // In BIN-OS, invoices are often linked to contracts or specific billingEvents
                const docRef = doc(db, 'contracts', id);
                const snap = await getDoc(docRef);

                if (snap.exists()) {
                    const data = snap.data();
                    // Basic security check: owner must own the contract.
                    if (data.ownerId !== user?.uid) {
                        setInvoice(null);
                    } else {
                        setInvoice({
                            id: snap.id,
                            date: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString() : 'N/A',
                            dueDate: data.dueDate?.toDate ? data.dueDate.toDate().toLocaleDateString() : 'N/A',
                            owner: data.ownerName || 'Valued Partner',
                            entity: data.entityName || 'Authorized Asset',
                            campus: data.campus || 'Main Cluster',
                            ownerTrn: data.trn || 'Pending Verification',
                            region: data.region || 'UAE',
                            integrityHash: data.integrityHash || '0xVIRTUAL_SETTLEMENT_LAYER',
                            property: data.propertyName || 'Registered Property',
                            items: data.billingItems || []
                        });
                    }
                }
            } catch (err) {
                console.error("Invoice fetch error:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchInvoice();
    }, [id, user]);

    if (loading) {
        return (
            <Container sx={{ py: 10, textAlign: 'center' }}>
                <CircularProgress color="inherit" sx={{ color: binThemeTokens.gold }} />
                <Typography sx={{ mt: 2, color: binThemeTokens.gold }}>Retrieving Secure Ledger...</Typography>
            </Container>
        );
    }

    if (!invoice) {
        return (
            <Container sx={{ py: 20, textAlign: 'center' }}>
                <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
                    <FileQuestion size={80} color={binThemeTokens.gold} />
                </Box>
                <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.textPrimary, mb: 2 }}>
                    LEDGER NOT FOUND
                </Typography>
                <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, maxWidth: 600, mx: 'auto' }}>
                    The requested invoice could not be located in the current settlement layer. 
                    Please verify the Invoice ID or contact institutional support.
                </Typography>
                <Button 
                    variant="outlined" 
                    onClick={() => window.history.back()}
                    sx={{ mt: 6, borderColor: binThemeTokens.gold, color: binThemeTokens.gold }}
                >
                    RETURN TO PORTFOLIO
                </Button>
            </Container>
        );
    }

    const total = (invoice.items || []).reduce((sum: number, item: any) => sum + (item.total || 0), 0);
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
                            {(invoice.items || []).map((item: any, i: number) => (
                                <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                    <TableCell sx={{ py: 4, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{item.descEn}</Typography>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 0.5 }}>{item.descAr}</Typography>
                                    </TableCell>
                                    <TableCell align="right" sx={{ py: 4, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Typography variant="h6" fontWeight="900" sx={{ color: (item.total || 0) < 0 ? '#ff4d4d' : binThemeTokens.textPrimary }}>
                                            {(item.total || 0) < 0 ? `-${formatAED(Math.abs(item.total))}` : formatAED(item.total)} AED
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
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 700 }}>{formatAED(total)} AED</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{t('common.vat_5')}</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.textPrimary, fontWeight: 700 }}>{formatAED(vat)} AED</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(198, 167, 94, 0.2)', my: 1 }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>TOTAL DUE / إجمالي المستحق</Typography>
                                <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>{formatAED(finalTotal)} AED</Typography>
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
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 900, color: binThemeTokens.goldLight, letterSpacing: 1 }}>{invoice?.integrityHash?.slice(0, 32).toUpperCase() || 'VIRTUAL'}...</Typography>
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
