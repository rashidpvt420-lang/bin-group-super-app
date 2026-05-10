import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Stack, Chip, CircularProgress, 
    Table, TableBody, TableCell, TableContainer, TableHead, 
    TableRow, Button, alpha, Grid, IconButton, Divider, Alert
} from '@mui/material';
import { 
    FileText, Calendar, Shield, CheckCircle2, 
    ArrowUpRight, Download, Info, Zap,
    Settings, Layout, Briefcase, Award, History
} from 'lucide-react';
import { db, collection, query, where, getDocs, onSnapshot, doc, updateDoc, serverTimestamp } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const STATUS_COLOR: Record<string, string> = { 
    ACTIVE: '#10b981', 
    EXPIRED: '#ef4444', 
    PENDING: '#f59e0b', 
    SUSPENDED: '#f97316' 
};

export default function OwnerContractsPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [contracts, setContracts] = useState<any[]>([]);
    const [updating, setUpdating] = useState(false);
    const [selectedService, setSelectedService] = useState<'PM_ONLY' | 'BOTH' | null>(null);

    useEffect(() => {
        if (!user?.email) return;
        
        const email = user.email.toLowerCase();
        const contractQ = query(collection(db, 'contracts'), where('ownerEmail', '==', email));
        
        const unsubscribe = onSnapshot(contractQ, (snap) => {
            const data: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setContracts(data);
            
            // Derive active selection from first contract or property passport if exists
            if (data.length > 0) {
                const current = data[0].managementScope || data[0].contractType;
                if (current === 'pm_only') setSelectedService('PM_ONLY');
                else if (current === 'hybrid' || current === 'both') setSelectedService('BOTH');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.email]);

    const handleServiceSelection = async (type: 'PM_ONLY' | 'BOTH') => {
        if (!contracts.length) return;
        setUpdating(true);
        try {
            // Update all active contracts for this owner to the new scope
            const promises = contracts.map(c => 
                updateDoc(doc(db, 'contracts', c.id), { 
                    managementScope: type,
                    contractType: type === 'PM_ONLY' ? 'pm_only' : 'hybrid',
                    updatedAt: serverTimestamp(),
                    version: (c.version || 1) + 1
                })
            );
            await Promise.all(promises);
            setSelectedService(type);
        } catch (err) {
            console.error("Governance Update Failed:", err);
        } finally {
            setUpdating(false);
        }
    };

    if (loading) return (
        <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('gov.verifying_stream') || 'Verifying Governance Stream...'}</Typography>
        </Box>
    );

    return (
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* Header */}
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 3 }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('gov.institutional_governance') || 'INSTITUTIONAL GOVERNANCE'}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>{t('nav.contracts') || 'Service Agreements'}</Typography>
                </Box>
                <Button variant="outlined" startIcon={<Download size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 900, borderRadius: 3, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    {t('gov.download_master') || 'Download Master Agreement'}
                </Button>
            </Box>

            {/* Management Scope Selection */}
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                {t('gov.active_scope') || 'ACTIVE MANAGEMENT SCOPE'}
            </Typography>
            <Grid container spacing={3} sx={{ mb: 6, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} md={6}>
                    <Paper 
                        onClick={() => !updating && handleServiceSelection('PM_ONLY')}
                        sx={{ 
                            p: 4, 
                            cursor: updating ? 'wait' : 'pointer',
                            bgcolor: selectedService === 'PM_ONLY' ? alpha(binThemeTokens.gold, 0.05) : 'rgba(15, 23, 42, 0.4)', 
                            border: `2px solid ${selectedService === 'PM_ONLY' ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`, 
                            borderRadius: 8,
                            transition: 'all 0.2s',
                            textAlign: isRTL ? 'right' : 'left',
                            position: 'relative',
                            '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.03), borderColor: binThemeTokens.gold }
                        }}
                    >
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}>
                                    <Briefcase size={24} />
                                </Box>
                                {selectedService === 'PM_ONLY' && <CheckCircle2 size={24} color={binThemeTokens.gold} />}
                            </Box>
                            <Box>
                                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{t('plan.pm_only.title') || 'PM ONLY'}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{t('plan.pm_only.desc') || 'Property Management Execution'}</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack spacing={1}>
                                {['Tenant Relations', 'Rent Collection', 'Legal Compliance'].map(f => (
                                    <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <Zap size={12} color={binThemeTokens.gold} />
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>{f}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </Stack>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper 
                        onClick={() => !updating && handleServiceSelection('BOTH')}
                        sx={{ 
                            p: 4, 
                            cursor: updating ? 'wait' : 'pointer',
                            bgcolor: selectedService === 'BOTH' ? alpha(binThemeTokens.gold, 0.05) : 'rgba(15, 23, 42, 0.4)', 
                            border: `2px solid ${selectedService === 'BOTH' ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`, 
                            borderRadius: 8,
                            transition: 'all 0.2s',
                            textAlign: isRTL ? 'right' : 'left',
                            '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.03), borderColor: binThemeTokens.gold }
                        }}
                    >
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}>
                                    <Award size={24} />
                                </Box>
                                {selectedService === 'BOTH' && <CheckCircle2 size={24} color={binThemeTokens.gold} />}
                            </Box>
                            <Box>
                                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{t('plan.hybrid.title') || 'PM + FM (OPTIMIZED)'}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{t('plan.hybrid.desc') || 'Full Sovereign Operations'}</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack spacing={1}>
                                {['PM Core Features', '24/7 Facility Maintenance', 'Preventive Scheduling'].map(f => (
                                    <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <Zap size={12} color={binThemeTokens.gold} />
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>{f}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>

            {/* Active Contracts Table */}
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                {t('gov.active_agreements') || 'ACTIVE SERVICE AGREEMENTS'}
            </Typography>
            {contracts.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}>
                    <FileText size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>{t('gov.no_contracts') || 'NO MASTER CONTRACTS ON RECORD'}</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', textAlign: isRTL ? 'right' : 'left' }}>{t('gov.table.asset') || 'PROPERTY / ASSET'}</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', textAlign: isRTL ? 'right' : 'left' }}>{t('gov.table.service') || 'SERVICE LEVEL'}</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', textAlign: isRTL ? 'right' : 'left' }}>{t('gov.table.period') || 'VALIDITY PERIOD'}</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', textAlign: isRTL ? 'right' : 'left' }}>{t('gov.table.value') || 'ANNUAL VALUE'}</TableCell>
                                <TableCell align={isRTL ? "left" : "right"} sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>{t('gov.table.governance') || 'GOVERNANCE'}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {contracts.map(c => (
                                <TableRow key={c.id} hover>
                                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 950 }}>{c.propertyName || t('gov.sovereign_asset') || 'Sovereign Asset'}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>{t('common.ref') || 'REF'}: #{c.id.slice(0,8)} (v{c.version || 1})</Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Chip 
                                            label={t(`plan.${c.contractType?.toLowerCase()}.title`) || c.contractType?.replace('_', ' ') || 'PM ONLY'} 
                                            size="small" 
                                            sx={{ height: 18, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }} 
                                        />
                                    </TableCell>
                                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Stack direction={isRTL ? "row-reverse" : "row"} spacing={1} alignItems="center">
                                            <Calendar size={12} color="rgba(255,255,255,0.2)" />
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>
                                                {c.startDate ? new Date(c.startDate?.seconds * 1000).toLocaleDateString() : 'Active'} — {c.endDate ? new Date(c.endDate?.seconds * 1000).toLocaleDateString() : 'Continuous'}
                                            </Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>
                                            AED {(c.annualValue || 0).toLocaleString()}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align={isRTL ? "left" : "right"}>
                                        <Chip 
                                            label={t(`status.${c.status?.toLowerCase()}`) || c.status || 'ACTIVE'} 
                                            size="small"
                                            sx={{ 
                                                height: 18, 
                                                fontSize: '0.6rem', 
                                                fontWeight: 950,
                                                bgcolor: alpha(STATUS_COLOR[c.status] || '#10b981', 0.1),
                                                color: STATUS_COLOR[c.status] || '#10b981'
                                            }} 
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Governance Notes */}
            <Paper sx={{ p: 3, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}>
                <Grid container spacing={4} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Grid item xs={12} md={9}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Shield size={16} /> {t('gov.sla_title') || 'SERVICE LEVEL ASSURANCE'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, display: 'block' }}>
                            {t('gov.sla_desc') || 'Contracts are legally binding as per the UAE Civil Code. Management selections trigger automated fleet allocation.'}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={3} sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                        <Button variant="outlined" sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, px: 3, borderRadius: 3 }} startIcon={<Settings size={16} style={{ marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }} />}>
                            {t('gov.configure_sla') || 'Configure SLA'}
                        </Button>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}
