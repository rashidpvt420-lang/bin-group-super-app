import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Stack, Button, CircularProgress, alpha, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { 
    Users, Building, Wallet, FileUp, TrendingUp, 
    ChevronRight, Briefcase, Plus, ShieldCheck, 
    Clock, ArrowUpRight, MessageSquare 
} from 'lucide-react';
import { db, collection, query, where, getDocs, limit, orderBy } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

export default function BrokerDashboardPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [recentLeads, setRecentLeads] = useState<any[]>([]);
    const [stats, setStats] = useState({
        leadsTotal: 0,
        leadsActive: 0,
        referralsPending: 0,
        referralsApproved: 0,
        commissionPending: 0,
        commissionPaid: 0
    });

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (!user?.uid) return;
            try {
                // Fetch Stats
                const leadsQ = query(collection(db, 'brokerLeads'), where('brokerId', '==', user.uid));
                const leadsSnap = await getDocs(leadsQ);
                let lTotal = 0, lActive = 0;
                leadsSnap.docs.forEach(d => {
                    lTotal++;
                    if (['new', 'contacted', 'viewing', 'negotiation'].includes(d.data().status)) lActive++;
                });

                const refQ = query(collection(db, 'referrals'), where('brokerId', '==', user.uid));
                const refSnap = await getDocs(refQ);
                let rPend = 0, rAppr = 0;
                refSnap.docs.forEach(d => {
                    const status = d.data().status;
                    if (['submitted', 'under_review'].includes(status)) rPend++;
                    if (status === 'approved') rAppr++;
                });

                const comQ = query(collection(db, 'broker_commissions'), where('brokerId', '==', user.uid));
                const comSnap = await getDocs(comQ);
                let cPend = 0, cPaid = 0;
                comSnap.docs.forEach(d => {
                    const status = String(d.data().status || '').toLowerCase();
                    const amount = d.data().amount || 0;
                    if (status === 'pending') cPend += amount;
                    if (status === 'paid') cPaid += amount;
                });

                setStats({
                    leadsTotal: lTotal, leadsActive: lActive,
                    referralsPending: rPend, referralsApproved: rAppr,
                    commissionPending: cPend, commissionPaid: cPaid
                });

                // Fetch Recent Activity
                const recentQ = query(
                    collection(db, 'brokerLeads'), 
                    where('brokerId', '==', user.uid),
                    orderBy('createdAt', 'desc'),
                    limit(5)
                );
                const recentSnap = await getDocs(recentQ);
                setRecentLeads(recentSnap.docs.map(d => ({ id: d.id, ...d.data() })));

            } catch (err: any) {
                const isPermissionDenied = err?.code === 'permission-denied' || 
                                           err?.message?.includes('permission-denied') || 
                                           err?.message?.includes('insufficient permissions');
                if (isPermissionDenied) {
                    console.warn("Dashboard fetch restricted (permission-denied). Failing silently with empty state.");
                } else {
                    console.error("Dashboard fetch error:", err);
                }
            } finally {
                setLoading(false);
            }
        };
        fetchDashboardData();
    }, [user]);

    const statCards = [
        { 
            label: 'ACTIVE LEADS', 
            value: stats.leadsActive, 
            icon: <Users size={24} />, 
            color: '#3b82f6', 
            path: '/broker/leads',
            desc: 'Leads currently in pipeline'
        },
        { 
            label: 'PENDING REFERRALS', 
            value: stats.referralsPending, 
            icon: <Building size={24} />, 
            color: binThemeTokens.gold, 
            path: '/broker/referrals',
            desc: 'Submissions under review'
        },
        { 
            label: 'PENDING PAYOUT', 
            value: `AED ${stats.commissionPending.toLocaleString()}`, 
            icon: <Wallet size={24} />, 
            color: '#f59e0b', 
            path: '/broker/commissions',
            desc: 'Earned, awaiting clearance'
        },
        { 
            label: 'LIFETIME PAID', 
            value: `AED ${stats.commissionPaid.toLocaleString()}`, 
            icon: <TrendingUp size={24} />, 
            color: '#10b981', 
            path: '/broker/commissions',
            desc: 'Total successfully settled'
        }
    ];

    return (
        <BrokerPageFrame
            title={`${t('dash.hello') || 'Hello'}, ${user?.displayName?.split(' ')[0] || 'Partner'}`}
            subtitle={`Broker Code: BIN-${user?.uid.substring(0,6).toUpperCase()}`}
            loading={loading}
            actions={
                <Button 
                    variant="contained" 
                    startIcon={<MessageSquare size={18} />}
                    sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950, px: 3, py: 1.5, borderRadius: 3, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.2) } }}
                >
                    CONTACT SUPPORT
                </Button>
            }
        >
            <Grid container spacing={3}>
                {/* ─── STAT CARDS ────────────────────────────────────────────────── */}
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

                {/* ─── QUICK ACTIONS ─────────────────────────────────────────────── */}
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, borderRadius: 8, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <ArrowUpRight size={20} color={binThemeTokens.gold} /> RAPID COMMANDS
                        </Typography>
                        <Grid container spacing={3}>
                            {[
                                { label: 'ADD NEW LEAD', icon: <Users />, path: '/broker/leads', color: binThemeTokens.gold, primary: true },
                                { label: 'SUBMIT REFERRAL', icon: <Building />, path: '/broker/referrals', color: '#FFF' },
                                { label: 'VIEW PAYOUTS', icon: <Wallet />, path: '/broker/commissions', color: '#FFF' },
                                { label: 'DOCUMENT VAULT', icon: <FileUp />, path: '/broker/documents', color: '#FFF' },
                            ].map((action, idx) => (
                                <Grid item xs={12} sm={6} key={idx}>
                                    <Button 
                                        fullWidth 
                                        variant={action.primary ? "contained" : "outlined"}
                                        onClick={() => navigate(action.path)}
                                        startIcon={React.cloneElement(action.icon as React.ReactElement, { size: 18 })}
                                        sx={{ 
                                            py: 3, 
                                            borderRadius: 4, 
                                            fontWeight: 950, 
                                            fontSize: '0.85rem',
                                            bgcolor: action.primary ? binThemeTokens.gold : 'transparent',
                                            color: action.primary ? '#000' : '#FFF',
                                            borderColor: action.primary ? binThemeTokens.gold : 'rgba(255,255,255,0.1)',
                                            '&:hover': {
                                                bgcolor: action.primary ? alpha(binThemeTokens.gold, 0.8) : 'rgba(255,255,255,0.05)',
                                                borderColor: action.primary ? binThemeTokens.gold : '#FFF'
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
                                    <Typography variant="body1" fontWeight="950" color="#FFF">SOVEREIGN COMPLIANCE</Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Your RERA certification is verified. You are eligible for automated commission payouts.</Typography>
                                </Box>
                            </Stack>
                        </Box>
                    </Paper>
                </Grid>

                {/* ─── RECENT ACTIVITY ───────────────────────────────────────────── */}
                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 4, borderRadius: 8, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4 }}>RECENT ACTIVITY</Typography>
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
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', py: 4 }}>No recent activity found.</Typography>
                            )}
                        </Stack>
                        <Button 
                            fullWidth 
                            onClick={() => navigate('/broker/leads')}
                            sx={{ mt: 4, color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.75rem' }}
                        >
                            VIEW FULL PIPELINE
                        </Button>
                    </Paper>
                </Grid>
            </Grid>
        </BrokerPageFrame>
    );
}
