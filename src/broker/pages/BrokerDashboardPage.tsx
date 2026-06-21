import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Paper, Grid, Stack, Button, CircularProgress, alpha, Divider, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { 
    Users, Building, Wallet, FileUp, TrendingUp, 
    ChevronRight, Briefcase, Plus, ShieldCheck, 
    Clock, ArrowUpRight, MessageSquare, PlusCircle, Send, FileText, DollarSign
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, limit, orderBy, doc, getDoc } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

export default function BrokerDashboardPage() {
    const { user } = useRole();
    const { tx } = useLanguage();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [recentLeads, setRecentLeads] = useState<any[]>([]);
    const [reraVerified, setReraVerified] = useState(false);
    const [reraStatus, setReraStatus] = useState<string>('NOT_SUBMITTED');
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

        getDoc(doc(db, 'users', user.uid))
            .then((snap) => {
                const data = snap.exists() ? snap.data() : {};
                setReraVerified(Boolean(data.reraVerified));
                setReraStatus(String(data.reraStatus || 'NOT_SUBMITTED'));
            })
            .catch((err) => console.warn('[BrokerDashboard] RERA status fetch failed:', err));

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

            const refQ = query(collection(db, 'referrals'), where('brokerId', '==', user.uid));
            unsubRef = onSnapshot(refQ, (snap) => {
                let rPend = 0, rAppr = 0;
                snap.docs.forEach(d => {
                    const status = d.data().status;
                    if (['submitted', 'under_review'].includes(status)) rPend++;
                    if (status === 'approved') rAppr++;
                });
                setStats(prev => ({ ...prev, referralsPending: rPend, referralsApproved: rAppr }));
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
            });
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

    const reraBanner = useMemo(() => {
        if (reraVerified) {
            return { severity: 'success' as const, text: tx('broker.dash.rera_verified', 'RERA certificate verified. You are eligible for automated commission payouts.') };
        }
        if (reraStatus === 'PENDING') {
            return { severity: 'info' as const, text: tx('broker.dash.rera_pending', 'RERA license submitted and under review. Commission payouts unlock once verification is approved.') };
        }
        if (reraStatus === 'REJECTED') {
            return { severity: 'error' as const, text: tx('broker.dash.rera_rejected', 'RERA verification was not approved. Please update your license number in your profile and resubmit.') };
        }
        return { severity: 'warning' as const, text: tx('broker.dash.rera_required', 'Add your RERA license number in your profile to unlock automated commission payouts.') };
    }, [reraVerified, reraStatus, tx]);

    const quickCommands = useMemo(() => [
        { label: tx('broker.dash.add_lead', 'Add New Lead'), path: '/broker/leads?new=1', icon: <PlusCircle size={18} />, color: '#10b981' },
        { label: tx('broker.dash.submit_referral', 'Submit Referral'), path: '/broker/referrals?new=1', icon: <Send size={18} />, color: binThemeTokens.gold },
        { label: tx('broker.dash.view_payouts', 'View Payouts'), path: '/broker/commissions', icon: <DollarSign size={18} />, color: '#f59e0b' },
        { label: tx('broker.dash.doc_vault', 'Document Vault'), path: '/broker/documents', icon: <FileText size={18} />, color: '#6366f1' },
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
                                <Typography variant="h4" fontWeight="950" color="#FFF">{card.value}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, letterSpacing: 1.5 }}>{card.label}</Typography>
                                <Typography variant="caption" sx={{ color: alpha(card.color, 0.6), fontWeight: 700, mt: 1 }}>{card.desc}</Typography>
                            </Stack>
                        </Paper>
                    </Grid>
                ))}

                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, borderRadius: 8, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
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
                                            color: '#FFF',
                                            borderColor: 'rgba(255,255,255,0.1)',
                                            '&:hover': {
                                                bgcolor: 'rgba(255,255,255,0.05)',
                                                borderColor: '#FFF'
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
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{tx('broker.dash.sovereign_compliance', 'SOVEREIGN COMPLIANCE')}</Typography>
                                    <Alert severity={reraBanner.severity} sx={{ borderRadius: 3 }} action={
                                        !reraVerified ? (
                                            <Button color="inherit" size="small" onClick={() => navigate('/broker/profile')} sx={{ fontWeight: 900 }}>
                                                {tx('broker.dash.rera_cta', 'UPDATE PROFILE')}
                                            </Button>
                                        ) : undefined
                                    }>
                                        {reraBanner.text}
                                    </Alert>
                                </Box>
                            </Stack>
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 4, borderRadius: 8, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4 }}>{tx('broker.dash.recent_activity', 'RECENT ACTIVITY')}</Typography>
                        <Stack spacing={3}>
                            {recentLeads.map((lead, idx) => (
                                <Box key={lead.id}>
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: idx === 0 ? binThemeTokens.gold : 'rgba(255,255,255,0.1)' }} />
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="body2" fontWeight="900" color="#FFF">{lead.leadName}</Typography>
                                            <Typography variant="caption" color="textSecondary">{lead.status.toUpperCase()} • {lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleDateString() : 'Just now'}</Typography>
                                        </Box>
                                        <ChevronRight size={16} color="rgba(255,255,255,0.2)" />
                                    </Stack>
                                    {idx < recentLeads.length - 1 && <Divider sx={{ mt: 2, borderColor: 'rgba(255,255,255,0.03)' }} />}
                                </Box>
                            ))}
                            {recentLeads.length === 0 && (
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', py: 4 }}>{tx('broker.dash.no_activity', 'No recent activity found.')}</Typography>
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
        </BrokerPageFrame>
    );
}
