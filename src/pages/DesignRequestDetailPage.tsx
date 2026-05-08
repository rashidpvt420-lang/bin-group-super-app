import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, Paper, Grid, Stack, Button, 
    Divider, alpha, CircularProgress, Chip, Alert
} from '@mui/material';
import { 
    Sparkles, ArrowLeft, Download, ShieldCheck, CreditCard, 
    CheckCircle2, Clock, XCircle, DollarSign, FileText
} from 'lucide-react';
import { db, doc, onSnapshot, updateDoc, serverTimestamp } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useParams, useNavigate } from 'react-router-dom';
import { formatAED } from '../utils/formatters';
import { NotificationEvents, ADDON_SERVICES } from '@bin/shared';

export default function DesignRequestDetailPage() {
    const { id } = useParams();
    const { user, role } = useRole();
    const { t, tx } = useLanguage();
    const navigate = useNavigate();
    
    const [request, setRequest] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (!id) return;
        const unsub = onSnapshot(doc(db, 'design_requests', id), (snap) => {
            if (snap.exists()) {
                setRequest({ id: snap.id, ...snap.data() });
            }
            setLoading(false);
        });
        return () => unsub();
    }, [id]);

    const handleOwnerAction = async (action: 'APPROVE' | 'REJECT' | 'TAKEOVER') => {
        if (!id || !request) return;
        setProcessing(true);
        try {
            const status = action === 'APPROVE' ? 'OWNER_APPROVED' : action === 'REJECT' ? 'OWNER_REJECTED' : 'OWNER_TAKEOVER_PAYMENT';
            await updateDoc(doc(db, 'design_requests', id), {
                status,
                updatedAt: serverTimestamp(),
                ownerActionAt: serverTimestamp()
            });

            // Trigger Notification for Tenant
            if (action === 'APPROVE' && request.userId && request.role === 'tenant') {
                await NotificationEvents.TENANT.DESIGN_APPROVED(
                    request.userId,
                    request.scope?.zoneType || 'requested area'
                );
            }
        } catch (err) {
            console.error("Action Fault:", err);
        } finally {
            setProcessing(false);
        }
    };

    const handleAcceptQuote = async () => {
        if (!id) return;
        setProcessing(true);
        try {
            await updateDoc(doc(db, 'design_requests', id), {
                status: 'PAYMENT_PENDING',
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Acceptance Fault:", err);
        } finally {
            setProcessing(false);
        }
    };

    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (!request) return <Container sx={{ py: 10 }}><Typography>Request not found in Sovereign Registry.</Typography></Container>;

    const { scope, quote } = request;
    const isOwner = role === 'owner';
    const canApprove = isOwner && request.status === 'PENDING_OWNER_NOC';
    const canAccept = (isOwner || request.status === 'OWNER_APPROVED') && request.status !== 'PAYMENT_PENDING' && request.status !== 'PAID';

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Button startIcon={<ArrowLeft />} onClick={() => navigate('/design-studio')} sx={{ color: 'rgba(255,255,255,0.5)', mb: 4, fontWeight: 900 }}>
                BACK TO STUDIO
            </Button>

            <Grid container spacing={6}>
                {/* LEFT: CONCEPT & SCOPE */}
                <Grid item xs={12} lg={7}>
                    <Paper sx={{ p: 0, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 4, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: alpha(binThemeTokens.gold, 0.05) }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>AI CONCEPT PREVIEW</Typography>
                            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>{scope.zoneType.toUpperCase()}</Typography>
                        </Box>
                        
                        <Box sx={{ p: 0, height: 400, bgcolor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            <Box component="img" src="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=80" sx={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
                            <Box sx={{ position: 'absolute', bottom: 20, left: 20, right: 20, p: 2, bgcolor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', borderRadius: 2 }}>
                                <Typography variant="body2" sx={{ color: '#FFF', fontStyle: 'italic' }}>
                                    "{quote.conceptDesignResult}"
                                </Typography>
                            </Box>
                        </Box>

                        <Box sx={{ p: 4 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 3 }}>DECLARED SCOPE PARAMETERS</Typography>
                            <Grid container spacing={3}>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="caption" color="textSecondary">DIMENSIONS</Typography>
                                    <Typography variant="body1" fontWeight="900">{scope.dimensions} SQ FT</Typography>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="caption" color="textSecondary">FINISH TIER</Typography>
                                    <Typography variant="body1" fontWeight="900">{scope.finishTier.toUpperCase()}</Typography>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="caption" color="textSecondary">ACCESS</Typography>
                                    <Typography variant="body1" fontWeight="900">{scope.accessLevel.toUpperCase()}</Typography>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="caption" color="textSecondary">EMIRATE</Typography>
                                    <Typography variant="body1" fontWeight="900">{scope.emirate.toUpperCase()}</Typography>
                                </Grid>
                            </Grid>

                            <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />

                            <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 2 }}>SELECTED ADD-ONS</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                                {scope.addons.map((a: string) => (
                                    <Chip key={a} label={ADDON_SERVICES.find(s => s.id === a)?.label} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#FFF' }} />
                                ))}
                                {scope.addons.length === 0 && <Typography variant="body2" color="textSecondary">No additional services selected.</Typography>}
                            </Stack>
                        </Box>
                    </Paper>
                </Grid>

                {/* RIGHT: BINDING QUOTE */}
                <Grid item xs={12} lg={5}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.8)', border: `2px solid ${binThemeTokens.gold}` }}>
                        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>EXECUTION PROTOCOL</Typography>
                                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>{formatAED(quote.finalTotal)}</Typography>
                            </Box>
                            <Chip label={request.status.replace('_', ' ')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }} />
                        </Box>

                        <Stack spacing={2} sx={{ mb: 4 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="textSecondary">Materials Estimate</Typography>
                                <Typography variant="body2" fontWeight="900">{formatAED(quote.materialsEstimate)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="textSecondary">Labor & Technical Execution</Typography>
                                <Typography variant="body2" fontWeight="900">{formatAED(quote.laborEstimate)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="textSecondary">Approvals & Logistics Allowance</Typography>
                                <Typography variant="body2" fontWeight="900">{formatAED(quote.approvalsAllowance + quote.logisticsAllowance)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="textSecondary">Add-on Services Subtotal</Typography>
                                <Typography variant="body2" fontWeight="900">{formatAED(quote.addonSubtotal)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="textSecondary">Furniture Procurement Fee (25%)</Typography>
                                <Typography variant="body2" fontWeight="900">{formatAED(quote.furnitureProcurementFee)}</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="textSecondary">Contingency (15%)</Typography>
                                <Typography variant="body2" fontWeight="900">{formatAED(quote.contingency)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="textSecondary">BIN Group Management Margin</Typography>
                                <Typography variant="body2" fontWeight="900">{formatAED(quote.binMargin)}</Typography>
                            </Box>
                        </Stack>

                        <Alert icon={<ShieldCheck size={20} />} severity="info" sx={{ bgcolor: 'rgba(59,130,246,0.1)', color: '#60A5FA', mb: 4, '& .MuiAlert-message': { fontSize: '0.75rem', lineHeight: 1.4 } }}>
                            {quote.bindingClause}
                        </Alert>

                        {canApprove && (
                            <Stack spacing={2}>
                                <Button variant="contained" fullWidth size="large" onClick={() => handleOwnerAction('APPROVE')} disabled={processing} sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 950 }}>
                                    APPROVE DESIGN & QUOTE
                                </Button>
                                <Stack direction="row" spacing={2}>
                                    <Button variant="outlined" fullWidth onClick={() => handleOwnerAction('TAKEOVER')} disabled={processing} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
                                        TAKEOVER PAYMENT
                                    </Button>
                                    <Button variant="outlined" fullWidth color="error" onClick={() => handleOwnerAction('REJECT')} disabled={processing} sx={{ fontWeight: 950 }}>
                                        REJECT
                                    </Button>
                                </Stack>
                            </Stack>
                        )}

                        {canAccept && (
                            <Button variant="contained" fullWidth size="large" onClick={handleAcceptQuote} disabled={processing} sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}>
                                ACCEPT & PROCEED TO PAYMENT
                            </Button>
                        )}

                        {request.status === 'PAYMENT_PENDING' && (
                            <Box sx={{ textAlign: 'center', py: 2 }}>
                                <CreditCard size={48} color={binThemeTokens.gold} style={{ margin: '0 auto 16px' }} />
                                <Typography variant="h6" fontWeight="950" sx={{ mb: 2 }}>AWAITING SETTLEMENT</Typography>
                                <Button variant="contained" fullWidth sx={{ bgcolor: '#10b981', fontWeight: 950 }}>PAY NOW</Button>
                            </Box>
                        )}
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
}

