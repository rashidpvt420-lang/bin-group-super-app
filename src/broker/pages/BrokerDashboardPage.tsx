import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, alpha, Divider, Alert, LinearProgress, Table, TableBody, TableCell, TableHead, TableRow, TableContainer } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { 
    Users, Building, Wallet, FileUp, TrendingUp, 
    ChevronRight, Briefcase, Plus, ShieldCheck, 
    Clock, ArrowUpRight, MessageSquare, PlusCircle, Send, FileText, DollarSign, CheckCircle2
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, limit, orderBy } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';
import RoleJourneyStrip from '../../components/RoleJourneyStrip';

export default function BrokerDashboardPage() {
    const { user } = useRole();
    const { tx } = useLanguage();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [recentLeads, setRecentLeads] = useState<any[]>([]);
    const [referrals, setReferrals] = useState<any[]>([]);
    const [listings, setListings] = useState<any[]>([]);
    const [stats, setStats] = useState({
        leadsTotal: 0,
        leadsActive: 0,
        referralsPending: 0,
        referralsApproved: 0,
        commissionPending: 0,
        commissionPaid: 0
    });

    useEffect(() => {
        if (!user?.uid) return;

        let unsubLeads: () => void;
        let unsubRef: () => void;
        let unsubCom: () => void;
        let unsubRecent: () => void;

        try {
            const leadsQ = query(collection(db, 'brokerLeads'), where('brokerId', '==', user.uid));
            unsubLeads = onSnapshot(leadsQ, (snap) => {
                let lTotal = 0, lActive = 0;
                snap.docs.forEach(d => {
                    lTotal++;
                    if (['new', 'contacted', 'viewing', 'negotiation'].includes(d.data().status)) lActive++;
                });
                setStats(prev => ({ ...prev, leadsTotal: lTotal, leadsActive: lActive }));
            });

        // Listen referrals for attribution table
        const refQ = query(collection(db, 'referrals'), where('brokerId', '==', user.uid), orderBy('createdAt', 'desc'), limit(10));
        unsubRef = onSnapshot(refQ, (snap) => {
            let rPend = 0, rAppr = 0;
            const rows: any[] = [];
            snap.docs.forEach(d => {
                const status = d.data().status;
                if (['submitted', 'under_review'].includes(status)) rPend++;
                if (status === 'approved') rAppr++;
                rows.push({ id: d.id, ...d.data() });
            });
            setStats(prev => ({ ...prev, referralsPending: rPend, referralsApproved: rAppr }));
            setReferrals(rows);
        });

        const comQ = query(collection(db, 'broker_commissions'), where('brokerId', '==', user.uid));
        unsubCom = onSnapshot(comQ, (snap) => {
            let cPend = 0, cPaid = 0;
            snap.docs.forEach(d => {
                const status = String(d.data().status || '').toLowerCase();
                const amount = d.data().amount || 0;
                if (status === 'pending') cPend += amount;
                if (status === 'paid') cPaid += amount;
            });
            setStats(prev => ({ ...prev, commissionPending: cPend, commissionPaid: cPaid }));
        });

        const recentQ = query(
            collection(db, 'brokerLeads'), 
            where('brokerId', '==', user.uid),
            orderBy('createdAt', 'desc'),
            limit(5)
        );
        unsubRecent = onSnapshot(recentQ, (snap) => {
            setRecentLeads(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, () => setLoading(false));

        // Also grab any property listings linked to this broker
        try {
            const listingsQ = query(collection(db, 'properties'), where('assignedBrokerId', '==', user.uid));
            onSnapshot(listingsQ, (snap) => setListings(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
        } catch { /* silent fail */ }

    } catch (err: any) {
        console.error("Dashboard fetch error:", err);
        setLoading(false);
    }

    return () => {
        if (unsubLeads) unsubLeads();
        if (unsubRef) unsubRef();
        if (unsubCom) unsubCom();
        if (unsubRecent) unsubRecent();
    };
}, [user]);

    const statCards = useMemo(() => [
        { label: tx('broker.dash.active_leads', 'Active Leads'), value: stats.leadsActive, desc: tx('broker.dash.leads_desc', 'Clients in pipeline'), icon: <Users size={22} />, color: '#10b981', path: '/broker/leads' },
        { label: tx('broker.dash.pending_referrals', 'Pending Referrals'), value: stats.referralsPending, desc: tx('broker.dash.referrals_desc', 'Submissions under review'), icon: <Briefcase size={22} />, color: binThemeTokens.gold, path: '/broker/referrals' },
        { label: tx('broker.dash.pending_payout', 'Pending Payout'), value: `AED ${stats.commissionPending.toLocaleString()}`, desc: tx('broker.dash.payout_desc', 'Earned, awaiting settlement'), icon: <DollarSign size={22} />, color: '#f59e0b', path: '/broker/commissions' },
        { label: tx('broker.dash.lifetime_paid', 'Lifetime Paid'), value: `AED ${stats.commissionPaid.toLocaleString()}`, desc: tx('broker.dash.lifetime_desc', 'Total successful settlements'), icon: <TrendingUp size={22} />, color: '#3b82f6', path: '/broker/commissions' },
    ], [stats, tx]);

    const quickCommands = useMemo(() => [
        { label: tx('broker.dash.add_lead', 'Add New Lead'), path: '/broker/leads/new', icon: <PlusCircle size={18} />, color: '#10b981' },
        { label: tx('broker.dash.submit_referral', 'Submit Referral'), path: '/broker/referrals/new', icon: <Send size={18} />, color: binThemeTokens.gold },
        { label: tx('broker.dash.view_payouts', 'View Payouts'), path: '/broker/payouts', icon: <DollarSign size={18} />, color: '#f59e0b' },
        { label: tx('broker.dash.doc_vault', 'Document Vault'), path: '/broker/vault', icon: <FileText size={18} />, color: '#6366f1' },
    ], [tx]);

    return (
        <BrokerPageFrame
            title={`${tx('dash.hello', 'Hello')}, ${user?.displayName?.split(' ')[0] || 'Partner'}`}
            subtitle={`${tx('broker.dash.broker_code', 'Broker Code')}: BIN-${user?.uid.substring(0,6).toUpperCase()}`}
            loading={loading}
            actions={
                <Button 
                    variant="contained" 
                    startIcon={<MessageSquare size={18} />}
                    onClick={() => { window.location.href = 'mailto:support@bin-groups.com'; }}
                    sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950, px: 3, py: 1.5, borderRadius: 3, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.2) } }}
                >
                    {tx('broker.dash.contact_support', 'CONTACT SUPPORT')}
                </Button>
            }
        >
            <RoleJourneyStrip role="broker" />

            <Grid container spacing={3}>
                {statCards.map((card, idx) => (
                    <Grid item xs={12} sm={6} md={3} key={idx}>
                        <Paper 
                            onClick={() => navigate(card.path)}
                            sx={{ 
                                p: 4, 
                                cursor: 'pointer', 
                                bgcolor: alpha(card.color, 0.05), 
                                border: `1px solid ${alpha(card.color, 0.15)}`, 
                                borderRadius: 6, 
                                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                position: 'relative',
                                overflow: 'hidden',
                                '&:hover': { 
                                    transform: 'translateY(-8px)', 
                                    borderColor: card.color, 
                                    bgcolor: alpha(card.color, 0.08),
                                    boxShadow: `0 20px 40px -15px ${alpha(card.color, 0.2)}`
                                }
                            }}
                        >
                            <Box sx={{ position: 'absolute', top: -10, right: -10, opacity: 0.05 }}>
                                {card.icon}
                            </Box>
                            <Stack spacing={1}>
                                <Box sx={{ p: 1.5, width: 'fit-content', bgcolor: alpha(card.color, 0.1), borderRadius: 3, color: card.color, mb: 1 }}>
                                    {card.icon}
                                </Box>
                                <Typography variant="h4" fontWeight="950" color={binThemeTokens.textPrimary}>{card.value}</Typography>
                                <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, letterSpacing: 1.5 }}>{card.label}</Typography>
                                <Typography variant="caption" sx={{ color: card.color, fontWeight: 700, mt: 1 }}>{card.desc}</Typography>
                            </Stack>
                        </Paper>
                    </Grid>
                ))}

                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, borderRadius: 8, bgcolor: binThemeTokens.softCanvas, border: '1px solid #E5E7EB', height: '100%' }}>
                        <Typography variant="h6" fontWeight="950" color={binThemeTokens.textPrimary} sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <ArrowUpRight size={20} color={binThemeTokens.gold} /> {tx('broker.dash.rapid_commands', 'RAPID COMMANDS')}
                        </Typography>
                        <Grid container spacing={3}>
                            {quickCommands.map((action, idx) => (
                                <Grid item xs={12} sm={6} key={idx}>
                                    <Button 
                                        fullWidth 
                                        variant="outlined"
                                        onClick={() => navigate(action.path)}
                                        startIcon={React.cloneElement(action.icon as React.ReactElement, { size: 18 })}
                                        sx={{
                                            py: 3,
                                            borderRadius: 4,
                                            fontWeight: 950,
                                            fontSize: '0.85rem',
                                            color: binThemeTokens.textPrimary,
                                            borderColor: '#E5E7EB',
                                            '&:hover': {
                                                bgcolor: '#F3F4F6',
                                                borderColor: binThemeTokens.gold
                                            }
                                        }}
                                    >
                                        {action.label}
                                    </Button>
                                </Grid>
                            ))}
                        </Grid>
                        
                        <Box sx={{ mt: 6, p: 3, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 6, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                            <Stack direction="row" spacing={3} alignItems="center">
                                <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: '50%' }}>
                                    <ShieldCheck color={binThemeTokens.gold} />
                                </Box>
                                <Box>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{tx('broker.dash.sovereign_compliance', 'SOVEREIGN COMPLIANCE')}</Typography>
                                    <Alert severity="success" sx={{ bgcolor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16,185,129,0.15)', color: '#10b981', borderRadius: 3 }}>
                                        {tx('broker.dash.rera_verified', 'RERA certificate verified. You are eligible for automated commission payouts.')}
                                    </Alert>
                                </Box>
                            </Stack>
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 4, borderRadius: 8, bgcolor: binThemeTokens.softCanvas, border: '1px solid #E5E7EB', height: '100%' }}>
                        <Typography variant="h6" fontWeight="950" color={binThemeTokens.textPrimary} sx={{ mb: 4 }}>{tx('broker.dash.recent_activity', 'RECENT ACTIVITY')}</Typography>
                        <Stack spacing={3}>
                            {recentLeads.map((lead, idx) => (
                                <Box key={lead.id}>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: idx === 0 ? binThemeTokens.gold : '#E5E7EB' }} />
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="body2" fontWeight="900" color={binThemeTokens.textPrimary}>{lead.leadName}</Typography>
                                            <Typography variant="caption" color="textSecondary">{lead.status.toUpperCase()} • {lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleDateString() : 'Just now'}</Typography>
                                        </Box>
                                        <ChevronRight size={16} color="#9CA3AF" />
                                    </Stack>
                                    {idx < recentLeads.length - 1 && <Divider sx={{ mt: 2, borderColor: '#F1F2F4' }} />}
                                </Box>
                            ))}
                            {recentLeads.length === 0 && (
                                <Typography variant="body2" sx={{ color: '#9CA3AF', textAlign: 'center', py: 4 }}>{tx('broker.dash.no_activity', 'No recent activity found.')}</Typography>
                            )}
                        </Stack>
                        <Button 
                            fullWidth 
                            onClick={() => navigate('/broker/leads')}
                            sx={{ mt: 4, color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.75rem' }}
                        >
                            {tx('broker.dash.view_pipeline', 'VIEW FULL PIPELINE')}
                        </Button>
                    </Paper>
                </Grid>
            </Grid>

            {/* Commission Payout Progress */}
            {(stats.commissionPending > 0 || stats.commissionPaid > 0) && (
                <Paper sx={{ mt: 4, p: 4, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                        <Typography variant="h6" fontWeight={950} sx={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <DollarSign size={20} color={binThemeTokens.gold} /> COMMISSION PAYOUT TRACKER
                        </Typography>
                        <Button size="small" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900 }} onClick={() => navigate('/broker/commissions')}>
                            FULL HISTORY
                        </Button>
                    </Stack>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={8}>
                            <Box sx={{ mb: 1.5 }}>
                                <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 900 }}>Payout Progress</Typography>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>
                                        AED {stats.commissionPaid.toLocaleString()} / AED {(stats.commissionPaid + stats.commissionPending).toLocaleString()}
                                    </Typography>
                                </Stack>
                                <LinearProgress
                                    variant="determinate"
                                    value={(stats.commissionPaid + stats.commissionPending) > 0 ? Math.round((stats.commissionPaid / (stats.commissionPaid + stats.commissionPending)) * 100) : 0}
                                    sx={{ height: 10, borderRadius: 5, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { background: `linear-gradient(90deg, ${binThemeTokens.gold}, #10b981)`, borderRadius: 5 } }}
                                />
                            </Box>
                            <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#10b981' }} />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>AED {stats.commissionPaid.toLocaleString()} Paid</Typography>
                                </Stack>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f59e0b' }} />
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>AED {stats.commissionPending.toLocaleString()} Pending</Typography>
                                </Stack>
                            </Stack>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 4, border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, textAlign: 'center' }}>
                                <Typography variant="h5" fontWeight={950} sx={{ color: binThemeTokens.gold }}>AED {stats.commissionPending.toLocaleString()}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>AWAITING SETTLEMENT</Typography>
                                <Button size="small" fullWidth sx={{ mt: 1.5, color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.7rem' }} onClick={() => navigate('/broker/payouts')}>REQUEST PAYOUT</Button>
                            </Paper>
                        </Grid>
                    </Grid>
                </Paper>
            )}

            {/* Referral Attribution Table */}
            {referrals.length > 0 && (
                <Paper sx={{ mt: 4, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                    <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="h6" fontWeight={950} sx={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Briefcase size={20} color={binThemeTokens.gold} /> REFERRAL ATTRIBUTION
                        </Typography>
                        <Button size="small" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900 }} onClick={() => navigate('/broker/referrals')}>VIEW ALL</Button>
                    </Box>
                    <TableContainer sx={{ maxHeight: 320 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: '#0a0f1e', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>REFERRAL NAME</TableCell>
                                    <TableCell sx={{ bgcolor: '#0a0f1e', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>PROPERTY</TableCell>
                                    <TableCell sx={{ bgcolor: '#0a0f1e', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>COMMISSION</TableCell>
                                    <TableCell sx={{ bgcolor: '#0a0f1e', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>STATUS</TableCell>
                                    <TableCell sx={{ bgcolor: '#0a0f1e', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>DATE</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {referrals.map((ref) => {
                                    const statusColors: Record<string, string> = { approved: '#10b981', submitted: '#f59e0b', under_review: '#3b82f6', rejected: '#ef4444' };
                                    const sc = statusColors[ref.status] || 'rgba(255,255,255,0.4)';
                                    return (
                                        <TableRow key={ref.id} hover>
                                            <TableCell sx={{ color: '#fff', fontWeight: 700 }}>{ref.clientName || ref.referralName || '—'}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>{ref.propertyName || '—'}</TableCell>
                                            <TableCell sx={{ color: ref.commissionAmount ? '#10b981' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{ref.commissionAmount ? `AED ${Number(ref.commissionAmount).toLocaleString()}` : '—'}</TableCell>
                                            <TableCell><Chip label={(ref.status || '').toUpperCase().replace(/_/g, ' ')} size="small" sx={{ bgcolor: alpha(sc, 0.1), color: sc, fontWeight: 900, fontSize: '0.6rem' }} /></TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>{ref.createdAt?.toDate ? ref.createdAt.toDate().toLocaleDateString() : '—'}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* Assigned Property Listings */}
            {listings.length > 0 && (
                <Paper sx={{ mt: 4, p: 4, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Typography variant="h6" fontWeight={950} sx={{ color: '#fff', mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Building size={20} color={binThemeTokens.gold} /> YOUR ASSIGNED LISTINGS
                    </Typography>
                    <Grid container spacing={2}>
                        {listings.slice(0, 6).map(listing => (
                            <Grid item xs={12} md={4} key={listing.id}>
                                <Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                                    <Typography variant="body1" sx={{ color: '#fff', fontWeight: 700, mb: 0.5 }}>{listing.propertyName || listing.name || 'Property'}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{listing.emirate || listing.location || 'UAE'} · {listing.totalUnits || listing.units || 0} units</Typography>
                                    <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                                        <Chip label={listing.status || 'LISTED'} size="small" sx={{ bgcolor: alpha('#10b981', 0.08), color: '#10b981', fontWeight: 900, fontSize: '0.55rem', height: 18 }} />
                                        {listing.rentAmount && <Chip label={`AED ${Number(listing.rentAmount).toLocaleString()}/yr`} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.08), color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.55rem', height: 18 }} />}
                                    </Stack>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </Paper>
            )}
        </BrokerPageFrame>
    );
}
