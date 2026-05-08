import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Paper, Stack, Button, Chip, 
    CircularProgress, alpha, Divider, Tooltip, IconButton
} from '@mui/material';
import { 
    Building2, FileText, DollarSign, Users, TrendingUp, 
    CreditCard, Wrench, Shield, ChevronRight, ArrowUpRight,
    Layout, CheckCircle2, Clock, Activity
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, collection, query, where, getDocs, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerDashboardPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ 
        properties: 0, 
        units: 0, 
        tenants: 0, 
        tickets: 0,
        rentCollected: 0,
        payoutsPending: 0,
        maintenanceCost: 0
    });
    const [properties, setProperties] = useState<any[]>([]);
    const [missingInfo, setMissingInfo] = useState<{ iban: boolean; units: boolean }>({ iban: false, units: false });
    const [contractScope, setContractScope] = useState<string>('');
    const [growth, setGrowth] = useState({ value: '+12.5%', trend: 'up' });

    useEffect(() => {
        if (!user?.email && !user?.uid) return;
        
        const email = user.email?.toLowerCase();
        const propQ = query(collection(db, 'properties'), where('ownerEmail', '==', email));
        
        const unsubscribe = onSnapshot(propQ, async (snap) => {
            const props = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setProperties(props);

            let unitCount = 0, tenantCount = 0, rent = 0, maint = 0;
            let unitsMissingDetails = false;
            
            const passportQ = query(collection(db, 'propertyPassports'), where('ownerEmail', '==', email));
            const passportSnap = await getDocs(passportQ);
            passportSnap.docs.forEach(d => {
                const data = d.data();
                unitCount += (data.totalUnits || 0);
                tenantCount += (data.occupiedUnits || 0);
                rent += (data.rentCollectedTotal || 0);
                maint += (data.maintenanceCostTotal || 0);
                if (!data.rentPerUnitTable || data.rentPerUnitTable.length === 0) unitsMissingDetails = true;
            });

            // Check for contracts scope
            const contractQ = query(collection(db, 'contracts'), where('ownerEmail', '==', email));
            const contractSnap = await getDocs(contractQ);
            let scope = '';
            if (!contractSnap.empty) {
                scope = contractSnap.docs[0].data().managementScope || contractSnap.docs[0].data().contractType || '';
                setContractScope(scope);
            }

            // Check for IBAN
            const bankQ = query(collection(db, 'ownerBankAccounts'), where('ownerEmail', '==', email));
            const bankSnap = await getDocs(bankQ);
            const ibanMissing = bankSnap.empty;

            setMissingInfo({ iban: ibanMissing, units: unitsMissingDetails });

            const ticketQ = query(collection(db, 'maintenanceTickets'), where('propertyId', 'in', props.length > 0 ? props.map(p => p.id) : ['none']), where('status', '!=', 'CLOSED'));
            const ticketSnap = props.length > 0 ? await getDocs(ticketQ) : { size: 0 };

            setStats({ 
                properties: props.length, 
                units: unitCount || props.reduce((acc, p) => acc + (p.unitsCount || 0), 0), 
                tenants: tenantCount, 
                tickets: ticketSnap.size,
                rentCollected: rent,
                payoutsPending: rent * 0.92,
                maintenanceCost: maint
            });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.email, user?.uid]);

    const KPI_CARDS = [
        { label: t('dash.kpi.total_revenue') || 'Total Revenue', value: `AED ${stats.rentCollected.toLocaleString()}`, icon: <DollarSign size={20} />, color: '#10b981', sub: t('dash.kpi.gross_rent') || 'Gross Rent Collected' },
        { label: t('dash.kpi.net_payout') || 'Net Payout', value: `AED ${stats.payoutsPending.toLocaleString()}`, icon: <CreditCard size={20} />, color: binThemeTokens.gold, sub: t('status.pending') || 'Pending Verification' },
        { label: t('dash.kpi.portfolio') || 'Asset Portfolio', value: stats.properties, icon: <Building2 size={20} />, color: '#3b82f6', sub: `${stats.units} ${t('field.units')}` },
        { label: t('dash.kpi.ops_load') || 'Operational Load', value: stats.tickets, icon: <Wrench size={20} />, color: '#ef4444', sub: t('dash.kpi.open_tasks') || 'Open Maintenance Tasks' },
    ];

    const QUICK_LINKS = [
        { label: t('nav.properties') || 'Property Registry', path: '/owner/properties', icon: <Building2 size={18} /> },
        { label: t('nav.tenants') || 'Tenant Directory', path: '/owner/tenants', icon: <Users size={18} /> },
        { label: t('nav.financials') || 'Financial Ledger', path: '/owner/financials', icon: <DollarSign size={18} /> },
        { label: t('dash.intel.roi') || 'Yield Analytics', path: '/owner/roi', icon: <TrendingUp size={18} /> },
        { label: t('nav.settings') || 'Payout Settings', path: '/owner/iban', icon: <Shield size={18} /> },
        { label: t('nav.contracts') || 'Service History', path: '/owner/contracts', icon: <FileText size={18} /> },
    ];

    if (loading) return (
        <Box sx={{ height: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 3 }}>{t('dash.syncing_portfolio') || 'Syncing Portfolio...'}</Typography>
        </Box>
    );

    return (
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* Missing Info Alerts */}
            {(contractScope === 'PM_ONLY' || contractScope === 'BOTH' || contractScope === 'pm_only' || contractScope === 'hybrid') && (missingInfo.iban || missingInfo.units) && (
                <Alert severity="warning" sx={{ mb: 4, bgcolor: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4 }}>
                    <Stack spacing={1}>
                        <Typography variant="subtitle2" fontWeight="950">ACTION REQUIRED: PORTAL INCOMPLETE</Typography>
                        <Typography variant="caption">Your contract scope requires additional information to enable full management features:</Typography>
                        <Stack direction="row" spacing={2}>
                            {missingInfo.iban && (
                                <Button size="small" variant="outlined" color="warning" onClick={() => navigate('/owner/iban')} sx={{ fontWeight: 900, borderRadius: 2 }}>
                                    Link IBAN
                                </Button>
                            )}
                            {missingInfo.units && (
                                <Button size="small" variant="outlined" color="warning" onClick={() => navigate('/owner/units')} sx={{ fontWeight: 900, borderRadius: 2 }}>
                                    Setup Unit Rent Table
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                </Alert>
            )}

            {/* Header Section */}
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 3 }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('dash.terminal.owner') || 'SOVEREIGN OWNER TERMINAL'}</Typography>
                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mt: 1, letterSpacing: -1 }}>
                        {t('dash.welcome') || 'Welcome'}, {user?.displayName?.split(' ')[0] || 'Partner'}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', mt: 0.5 }}>{t('dash.monitoring_desc') || 'Real-time monitoring of your UAE asset portfolio.'}</Typography>
                </Box>
                <Stack direction={isRTL ? "row-reverse" : "row"} spacing={2}>
                    <Button variant="outlined" startIcon={<Activity size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 900, borderRadius: 3 }}>{t('nav.audit_logs') || 'Audit Logs'}</Button>
                    <Button variant="contained" onClick={() => navigate('/owner/roi')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 3, borderRadius: 3 }}>{t('dash.portfolio_roi') || 'Portfolio ROI'}</Button>
                </Stack>
            </Box>

            {/* KPI Grid */}
            <Grid container spacing={3} sx={{ mb: 6 }}>
                {KPI_CARDS.map((kpi, idx) => (
                    <Grid item xs={12} sm={6} md={3} key={idx}>
                        <Paper sx={{ 
                            p: 3, 
                            bgcolor: 'rgba(15, 23, 42, 0.4)', 
                            border: `1px solid ${alpha(kpi.color, 0.2)}`, 
                            borderRadius: 6,
                            position: 'relative',
                            overflow: 'hidden',
                            transition: 'transform 0.2s',
                            '&:hover': { transform: 'translateY(-4px)', borderColor: kpi.color }
                        }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Box sx={{ p: 1, bgcolor: alpha(kpi.color, 0.1), borderRadius: 2, color: kpi.color }}>
                                    {kpi.icon}
                                </Box>
                                <ArrowUpRight size={16} color="rgba(255,255,255,0.2)" />
                            </Box>
                            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 0.5, textAlign: isRTL ? 'right' : 'left' }}>{kpi.value}</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block', letterSpacing: 1, textAlign: isRTL ? 'right' : 'left' }}>{kpi.label.toUpperCase()}</Typography>
                            <Typography variant="caption" sx={{ color: alpha(kpi.color, 0.8), fontWeight: 700, mt: 1, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>{kpi.sub}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 0, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden', mb: 4 }}>
                        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Building2 size={20} color={binThemeTokens.gold} /> {t('dash.active_assets') || 'ACTIVE ASSETS'}
                            </Typography>
                            <Button size="small" sx={{ color: binThemeTokens.gold, fontWeight: 900 }} onClick={() => navigate('/owner/properties')}>{t('common.view_all') || 'View All'}</Button>
                        </Box>
                        
                        <Box sx={{ p: 2 }}>
                            {properties.length === 0 ? (
                                <Box sx={{ py: 10, textAlign: 'center' }}>
                                    <Building2 size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>{t('dash.no_properties') || 'NO PROPERTIES LINKED'}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.1)', mt: 1, display: 'block' }}>{t('dash.contact_sync') || 'Contact admin@bin-groups.com to synchronize your portfolio.'}</Typography>
                                </Box>
                            ) : (
                                <Grid container spacing={2}>
                                    {properties.slice(0, 4).map(prop => (
                                        <Grid item xs={12} md={6} key={prop.id}>
                                            <Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' } }}
                                                onClick={() => navigate(`/owner/properties/${prop.id}`)}>
                                                <Stack direction={isRTL ? "row-reverse" : "row"} spacing={2} alignItems="center">
                                                    <Box sx={{ width: 48, height: 48, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: binThemeTokens.gold }}>
                                                        <Building2 size={24} />
                                                    </Box>
                                                    <Box sx={{ flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
                                                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#FFF' }}>{prop.propertyName}</Typography>
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>{prop.emirate} · {prop.unitsCount || 0} {t('field.units')}</Typography>
                                                    </Box>
                                                    <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.2)' }}><ChevronRight size={18} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} /></IconButton>
                                                </Stack>
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Box>
                    </Paper>

                    <Paper sx={{ p: 3, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row', textAlign: isRTL ? 'right' : 'left' }}>
                            <DollarSign size={20} color={binThemeTokens.gold} /> {t('dash.financial_overview') || 'FINANCIAL BREAKDOWN'}
                        </Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)', textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block', mb: 2 }}>{t('dash.revenue') || 'REVENUE'}</Typography>
                                    <Stack spacing={1.5}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Expected Rent</Typography>
                                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 950 }}>AED {Math.round(stats.rentCollected * 1.1).toLocaleString()}</Typography>
                                        </Box>
                                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Collected Rent</Typography>
                                            <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 950 }}>AED {stats.rentCollected.toLocaleString()}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Pending / Overdue</Typography>
                                            <Typography variant="body2" sx={{ color: '#f59e0b', fontWeight: 950 }}>AED {Math.round(stats.rentCollected * 0.1).toLocaleString()}</Typography>
                                        </Box>
                                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Revenue Growth</Typography>
                                            <Typography variant="body2" sx={{ color: growth.trend === 'up' ? '#10b981' : '#ef4444', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                {growth.value} <TrendingUp size={12} />
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)', textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block', mb: 2 }}>{t('dash.deductions') || 'DEDUCTIONS & PAYOUT'}</Typography>
                                    <Stack spacing={1.5}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>BIN GROUP Fee (5%)</Typography>
                                            <Typography variant="body2" sx={{ color: '#ef4444', fontWeight: 950 }}>- AED {Math.round(stats.rentCollected * 0.05).toLocaleString()}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Maintenance Costs</Typography>
                                            <Typography variant="body2" sx={{ color: '#ef4444', fontWeight: 950 }}>- AED {stats.maintenanceCost.toLocaleString()}</Typography>
                                        </Box>
                                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Owner Net Payout</Typography>
                                            <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>AED {Math.round(stats.rentCollected * 0.95 - stats.maintenanceCost).toLocaleString()}</Typography>
                                        </Box>
                                    </Stack>
                                </Box>
                            </Grid>
                        </Grid>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, mb: 4 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3, textAlign: isRTL ? 'right' : 'left' }}>{t('dash.command_nodes') || 'COMMAND NODES'}</Typography>
                        <Grid container spacing={2}>
                            {[
                                ...QUICK_LINKS,
                                { label: 'Property Passport', path: '/owner/property-passport', icon: <FileText size={18} /> },
                                { label: 'Documents', path: '/owner/documents', icon: <FileText size={18} /> },
                                { label: 'Unit Ledger', path: '/owner/units', icon: <Building2 size={18} /> },
                            ].map((link, idx) => (
                                <Grid item xs={6} key={idx}>
                                    <Button 
                                        fullWidth 
                                        variant="outlined" 
                                        onClick={() => navigate(link.path)}
                                        sx={{ 
                                            flexDirection: 'column', 
                                            gap: 1.5, 
                                            py: 2.5, 
                                            borderRadius: 4, 
                                            borderColor: 'rgba(255,255,255,0.05)', 
                                            color: 'rgba(255,255,255,0.6)',
                                            '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.05), borderColor: binThemeTokens.gold, color: '#FFF' }
                                        }}
                                    >
                                        <Box sx={{ color: binThemeTokens.gold }}>{link.icon}</Box>
                                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 950 }}>{link.label.toUpperCase()}</Typography>
                                    </Button>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>

                    <Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Shield size={16} /> {t('dash.sovereignty_title') || 'DATA SOVEREIGNTY'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, display: 'block' }}>
                            {t('dash.sovereignty_desc') || 'Your asset data is strictly partitioned and stored under UAE sovereign standards. BIN GROUP utilizes institutional encryption for all records.'}
                        </Typography>
                        <Button fullWidth size="small" sx={{ mt: 2, color: 'rgba(255,255,255,0.4)', fontWeight: 900, flexDirection: isRTL ? 'row-reverse' : 'row' }} startIcon={<CheckCircle2 size={12} />}>
                            {t('dash.compliance_verified') || 'Compliance Verified'}
                        </Button>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}
