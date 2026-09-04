import React, { useState, useEffect } from 'react';
import {
    Container, Typography, Box, Paper, Grid, Stack, Button,
    Divider, alpha, CircularProgress, Chip, Alert, TextField, MenuItem
} from '@mui/material';
import {
    ArrowLeft, ShieldCheck, CreditCard,
    Clock, FileText, Image as ImageIcon, UserCheck, Building2, ClipboardList
} from 'lucide-react';
import {
    db,
    doc,
    onSnapshot,
    functions,
    httpsCallable,
} from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useParams, useNavigate } from 'react-router-dom';
import { formatAED } from '../utils/formatters';

const terminalStatuses = ['PAYMENT_SUBMITTED', 'PAID', 'ENGINEER_REVIEW', 'ADMIN_REVIEW', 'WORK_ORDER_READY', 'OWNER_REJECTED', 'REJECTED'];
const PRIVATE_MEDIA_REFRESH_MS = 10 * 60 * 1000;

type ProtectedMedia = {
    referenceImages: string[];
    generatedImages: string[];
    expiresAtMs: number;
};

type PaymentInstructions = {
    amount: number;
    currency: string;
    legalBeneficiary: string;
    officeLocation: string;
    approvedMethods: string[];
    paymentConfigVersion: string;
    paymentConfigHash: string;
};

function text(value: unknown, fallback = '—') {
    const resolved = String(value ?? '').trim();
    return resolved || fallback;
}

function stringArray(value: unknown) {
    return Array.isArray(value) ? value.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
}

function buildExecutionScope(request: any) {
    const scope = request?.scope || {};
    const quote = request?.quote || {};
    return {
        zoneType: text(scope.zoneType, 'Design zone'),
        dimensions: Number(scope.dimensions || 0),
        unitNumber: text(scope.unitNumber),
        floorLevel: text(scope.floorLevel),
        propertyName: text(request?.propertyName),
        designStyle: text(request?.designStyle),
        finishTier: text(scope.finishTier),
        emirate: text(scope.emirate),
        existingCondition: text(scope.existingCondition, 'Not declared'),
        requiredWork: text(scope.requiredWork, 'Not declared'),
        scopeDescription: text(scope.scopeDescription, 'Not declared'),
        keepConstraints: text(scope.keepConstraints, 'No constraints declared'),
        imageCount: Array.isArray(scope.referenceImagePaths) ? scope.referenceImagePaths.length : 0,
        finalTotal: Number(quote.finalTotal || 0),
        materialsEstimate: Number(quote.materialsEstimate || 0),
        laborEstimate: Number(quote.laborEstimate || 0),
        approvalsAllowance: Number(quote.approvalsAllowance || 0),
        logisticsAllowance: Number(quote.logisticsAllowance || 0),
        contingency: Number(quote.contingency || 0),
        binMargin: Number(quote.binMargin || 0),
    };
}

export default function DesignRequestDetailPage() {
    const { id } = useParams();
    const { user, role } = useRole();
    const { tx } = useLanguage();
    const navigate = useNavigate();
    const [request, setRequest] = useState<any>(null);
    const [protectedMedia, setProtectedMedia] = useState<ProtectedMedia>({ referenceImages: [], generatedImages: [], expiresAtMs: 0 });
    const [loading, setLoading] = useState(true);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [actionError, setActionError] = useState('');
    const [paymentInstructions, setPaymentInstructions] = useState<PaymentInstructions | null>(null);
    const [paymentMethod, setPaymentMethod] = useState('');

    const currentPath = window.location.pathname;
    const basePrefix = currentPath.includes('/design-studio') ? currentPath.split('/design-studio')[0] : '';

    useEffect(() => {
        if (!id) return;
        setRequest(null);
        setLoading(true);
        setPaymentInstructions(null);
        setPaymentMethod('');
        setActionError('');
        const unsub = onSnapshot(
            doc(db, 'design_requests', id),
            (snap) => {
                if (snap.exists()) {
                    setRequest({ id: snap.id, ...snap.data() });
                } else setRequest(null);
                setLoading(false);
            },
            (error) => {
                setRequest(null);
                setActionError(error.message || 'Design request could not be loaded.');
                setLoading(false);
            },
        );
        return () => unsub();
    }, [id]);

    useEffect(() => {
        setProtectedMedia({ referenceImages: [], generatedImages: [], expiresAtMs: 0 });
        if (!id || !user?.uid) {
            return undefined;
        }
        let cancelled = false;
        let timer: number | undefined;
        const refreshMedia = async () => {
            setMediaLoading(true);
            try {
                const getMedia = httpsCallable(functions, 'getAIDesignRequestMedia');
                const result: any = await getMedia({ requestId: id });
                const data = result?.data || {};
                if (!cancelled) {
                    setProtectedMedia({
                        referenceImages: stringArray(data.referenceImages),
                        generatedImages: stringArray(data.generatedImages),
                        expiresAtMs: Number(data.expiresAtMs || 0),
                    });
                    setActionError((current) => current.startsWith('Protected design media') ? '' : current);
                }
            } catch (error: any) {
                console.error('Protected design media refresh failed:', error);
                if (!cancelled) {
                    setProtectedMedia({ referenceImages: [], generatedImages: [], expiresAtMs: 0 });
                    setActionError(`Protected design media could not be loaded: ${error?.message || 'authorisation or App Check failed.'}`);
                }
            } finally {
                if (!cancelled) setMediaLoading(false);
            }
        };
        void refreshMedia();
        timer = window.setInterval(() => void refreshMedia(), PRIVATE_MEDIA_REFRESH_MS);
        return () => {
            cancelled = true;
            if (timer !== undefined) window.clearInterval(timer);
        };
    }, [id, user?.uid]);

    const handleOwnerAction = async (action: 'APPROVE' | 'REJECT' | 'TAKEOVER') => {
        if (!id || !request || !user?.uid) return;
        setProcessing(true);
        setActionError('');
        try {
            const decide = httpsCallable(functions, 'submitDesignOwnerDecision');
            await decide({ designRequestId: id, action });
        } catch (err: any) {
            console.error('Design owner action failed:', err);
            setActionError(err?.message || 'The owner decision could not be saved.');
        } finally {
            setProcessing(false);
        }
    };

    const handleLoadPaymentInstructions = async () => {
        if (!id || !user?.uid) return;
        setProcessing(true);
        setActionError('');
        setPaymentInstructions(null);
        try {
            const load = httpsCallable<{ designRequestId: string }, PaymentInstructions>(functions, 'getDesignPaymentInstructions');
            const result = await load({ designRequestId: id });
            setPaymentInstructions(result.data);
            setPaymentMethod(request?.paymentMethod || '');
        } catch (error: any) {
            setActionError(error?.message || 'Approved payment instructions are unavailable. Do not make a payment.');
        } finally { setProcessing(false); }
    };

    const handleCreatePaymentRequest = async () => {
        if (!id || !request || !user?.uid || !paymentInstructions || !paymentMethod) return;
        setProcessing(true);
        setActionError('');
        try {
            const createPaymentRequest = httpsCallable(functions, 'createDesignPaymentRequest');
            await createPaymentRequest({ designRequestId: id, method: paymentMethod,
                paymentConfigVersion: paymentInstructions.paymentConfigVersion,
                paymentConfigHash: paymentInstructions.paymentConfigHash });
        } catch (err: any) {
            console.error('Design payment request failed:', err);
            setActionError(err?.message || 'The Cash/Cheque payment request could not be recorded.');
        } finally {
            setProcessing(false);
        }
    };

    const handleAdminEngineerHandoff = async () => {
        if (!id || !request || !user?.uid) return;
        setProcessing(true);
        setActionError('');
        try {
            const handoff = httpsCallable(functions, 'adminHandoffDesignRequest');
            await handoff({ designRequestId: id });
        } catch (err: any) {
            console.error('Engineer handoff failed:', err);
            setActionError(err?.message || 'The engineer handoff could not be saved.');
        } finally {
            setProcessing(false);
        }
    };

    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (!request) return <Container sx={{ py: 10 }}>{actionError ? <Alert severity="error">{actionError}</Alert> : <Typography>Design request not found.</Typography>}</Container>;

    const { scope = {}, quote = {} } = request;
    const isOwner = role === 'owner' && request.ownerId === user?.uid;
    const isAdmin = ['admin', 'ceo'].includes(String(role || '').toLowerCase());
    const isTenantRequest = request.role === 'tenant';
    const isPayer = request.payerId ? request.payerId === user?.uid : request.role === 'owner' && request.ownerId === user?.uid;
    const canApprove = isOwner && ['PENDING_OWNER_NOC', 'AWAITING_OWNER_APPROVAL'].includes(String(request.status || ''));
    const canCreatePayment = isPayer && !terminalStatuses.includes(String(request.status || '')) && ['OWNER_APPROVED_TENANT_TO_PAY', 'OWNER_APPROVED_OWNER_TO_PAY', 'DEPOSIT_PENDING', 'AI_CONCEPT_READY', 'PAYMENT_PENDING'].includes(String(request.status || ''));
    const canAdminHandoff = isAdmin && request.paymentVerified === true && request.status === 'PAID';
    const referenceImages = protectedMedia.referenceImages;
    const generatedImages = protectedMedia.generatedImages;
    const primaryVisual = generatedImages[0] || referenceImages[0] || '';
    const executionScope = request.executionScope || buildExecutionScope(request);

    return (
        <Container maxWidth="xl" sx={{ py: 6, pr: { xs: 9, md: 3 }, pb: { xs: 14, md: 8 } }}>
            <Button startIcon={<ArrowLeft />} onClick={() => navigate(`${basePrefix}/design-studio`)} sx={{ color: 'rgba(255,255,255,0.5)', mb: 4, fontWeight: 900 }}>
                BACK TO STUDIO
            </Button>
            {actionError && <Alert severity="error" sx={{ mb: 3 }}>{actionError}</Alert>}
            {mediaLoading && <Alert severity="info" sx={{ mb: 3 }}>Refreshing authorised private design media…</Alert>}

            <Grid container spacing={6}>
                <Grid item xs={12} lg={7}>
                    <Paper sx={{ p: 0, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden', minWidth: 0 }}>
                        <Box sx={{ p: 4, borderBottom: '1px solid rgba(255,255,255,0.05)', bgcolor: alpha(binThemeTokens.gold, 0.05) }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>AI CONCEPT PREVIEW</Typography>
                            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', overflowWrap: 'anywhere' }}>{text(scope.zoneType, 'DESIGN').toUpperCase()}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', mt: 1 }}>
                                {isTenantRequest ? 'Tenant request requires owner NOC before payment and execution.' : 'Owner request can proceed directly to payment and admin execution.'}
                            </Typography>
                        </Box>

                        <Box sx={{ p: 0, minHeight: 360, bgcolor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            {primaryVisual ? (
                                <Box component="img" src={primaryVisual} sx={{ width: '100%', height: 420, objectFit: 'cover', opacity: 0.9 }} />
                            ) : (
                                <Box sx={{ width: '100%', minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4, textAlign: 'center', bgcolor: 'rgba(15,23,42,0.72)' }}>
                                    <Stack spacing={2} alignItems="center">
                                        <ImageIcon size={48} color="rgba(255,255,255,0.35)" />
                                        <Typography variant="h6" fontWeight={950} sx={{ color: 'rgba(255,255,255,0.78)' }}>PROTECTED VISUAL UNAVAILABLE</Typography>
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.48)', maxWidth: 420 }}>A fresh authorised media URL is required. No public, demo or stock image is substituted.</Typography>
                                    </Stack>
                                </Box>
                            )}
                            <Box sx={{ position: 'absolute', bottom: 20, left: 20, right: 20, p: 2, bgcolor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', borderRadius: 2 }}>
                                <Typography variant="body2" sx={{ color: '#FFF', fontStyle: 'italic', overflowWrap: 'anywhere' }}>
                                    "{request.conceptPrompt || quote.conceptDesignResult || `Concept generated for ${text(scope.zoneType, 'requested zone')}.`}"
                                </Typography>
                            </Box>
                        </Box>

                        <Box sx={{ p: 4 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 3 }}>EXECUTION SCOPE FOR ADMIN / ENGINEER</Typography>
                            <Grid container spacing={3}>
                                <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">UNIT</Typography><Typography variant="body1" fontWeight="900">{executionScope.unitNumber}</Typography></Grid>
                                <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">FLOOR</Typography><Typography variant="body1" fontWeight="900">{executionScope.floorLevel}</Typography></Grid>
                                <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">DIMENSIONS</Typography><Typography variant="body1" fontWeight="900">{executionScope.dimensions} SQ FT</Typography></Grid>
                                <Grid item xs={6} md={3}><Typography variant="caption" color="textSecondary">FINISH TIER</Typography><Typography variant="body1" fontWeight="900">{executionScope.finishTier.toUpperCase()}</Typography></Grid>
                            </Grid>

                            <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />

                            <Grid container spacing={3}>
                                <Grid item xs={12} md={6}>
                                    <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.025)', borderRadius: 3 }}>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>CURRENT CONDITION</Typography>
                                        <Typography variant="body2" sx={{ color: '#FFF', mt: 1, overflowWrap: 'anywhere' }}>{executionScope.existingCondition}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.025)', borderRadius: 3 }}>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>REQUIRED WORK</Typography>
                                        <Typography variant="body2" sx={{ color: '#FFF', mt: 1, overflowWrap: 'anywhere' }}>{executionScope.requiredWork}</Typography>
                                    </Paper>
                                </Grid>
                            </Grid>

                            <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />

                            <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 2 }}>REFERENCE IMAGES</Typography>
                            <Grid container spacing={2}>
                                {referenceImages.map((url) => (
                                    <Grid item xs={6} md={4} key={url}>
                                        <Box component="img" src={url} sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)' }} />
                                    </Grid>
                                ))}
                                {referenceImages.length === 0 && (
                                    <Grid item xs={12}>
                                        <Alert icon={<ImageIcon size={18} />} severity="warning" sx={{ bgcolor: 'rgba(245,158,11,0.08)', color: '#fbbf24' }}>Protected reference media is unavailable. Execution cannot be treated as visual-evidence complete.</Alert>
                                    </Grid>
                                )}
                            </Grid>
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={5}>
                    <Stack spacing={4}>
                        <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.8)', border: `2px solid ${binThemeTokens.gold}`, minWidth: 0 }}>
                            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>EXECUTION QUOTE</Typography>
                                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>{formatAED(quote.finalTotal || 0)}</Typography>
                                    <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900, display: 'block', mt: 0.5 }}>
                                        15% Upfront Deposit Required: {formatAED(Number(quote.mobilizationAmount ?? Math.round(Number(quote.finalTotal || 0) * 0.15 * 100) / 100))}
                                    </Typography>
                                </Box>
                                <Chip label={String(request.status || 'DRAFT').replace(/_/g, ' ')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, maxWidth: 220 }} />
                            </Box>

                            <Stack spacing={2} sx={{ mb: 4 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}><Typography variant="body2" color="textSecondary">Materials Estimate</Typography><Typography variant="body2" fontWeight="900">{formatAED(quote.materialsEstimate || 0)}</Typography></Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}><Typography variant="body2" color="textSecondary">Labor & Technical Execution</Typography><Typography variant="body2" fontWeight="900">{formatAED(quote.laborEstimate || 0)}</Typography></Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}><Typography variant="body2" color="textSecondary">Approvals & Logistics</Typography><Typography variant="body2" fontWeight="900">{formatAED((quote.approvalsAllowance || 0) + (quote.logisticsAllowance || 0))}</Typography></Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}><Typography variant="body2" color="textSecondary">Contingency</Typography><Typography variant="body2" fontWeight="900">{formatAED(quote.contingency || 0)}</Typography></Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}><Typography variant="body2" color="textSecondary">BIN Group Management Margin</Typography><Typography variant="body2" fontWeight="900">{formatAED(quote.binMargin || 0)}</Typography></Box>
                            </Stack>

                            <Alert icon={<ShieldCheck size={20} />} severity="info" sx={{ bgcolor: 'rgba(59,130,246,0.1)', color: '#60A5FA', mb: 4, '& .MuiAlert-message': { fontSize: '0.75rem', lineHeight: 1.4 } }}>
                                {quote.bindingClause || 'Server-calculated scope quote. Any hidden condition or owner/admin variation requires updated approval.'}
                            </Alert>

                            {canApprove && (
                                <Stack spacing={2}>
                                    <Button variant="contained" fullWidth size="large" onClick={() => handleOwnerAction('APPROVE')} disabled={processing} sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 950 }}>
                                        APPROVE NOC — TENANT TO PAY
                                    </Button>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                        <Button variant="outlined" fullWidth onClick={() => handleOwnerAction('TAKEOVER')} disabled={processing} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
                                            OWNER PAYS
                                        </Button>
                                        <Button variant="outlined" fullWidth color="error" onClick={() => handleOwnerAction('REJECT')} disabled={processing} sx={{ fontWeight: 950 }}>
                                            REJECT
                                        </Button>
                                    </Stack>
                                </Stack>
                            )}

                            {canCreatePayment && (
                                <Stack spacing={2}>
                                    <Button variant="outlined" fullWidth onClick={handleLoadPaymentInstructions} disabled={processing}>
                                        {paymentInstructions ? 'REFRESH' : 'VIEW'} CASH / CHEQUE INSTRUCTIONS
                                    </Button>
                                    {paymentInstructions && <>
                                        <Alert severity="info">Pay {formatAED(paymentInstructions.amount)} to {paymentInstructions.legalBeneficiary} at {paymentInstructions.officeLocation}. Cash or Cheque only. A request does not confirm receipt of funds.</Alert>
                                        <TextField select label="Payment method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={processing || request.status === 'PAYMENT_PENDING'} fullWidth>
                                            {paymentInstructions.approvedMethods.filter((method) => ['CASH', 'CHEQUE'].includes(method)).map((method) => <MenuItem key={method} value={method}>{method === 'CASH' ? 'Cash' : 'Cheque'}</MenuItem>)}
                                        </TextField>
                                        {request.status !== 'PAYMENT_PENDING' && <Button variant="contained" fullWidth onClick={handleCreatePaymentRequest} disabled={processing || !paymentMethod} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>REQUEST 15% DEPOSIT VERIFICATION</Button>}
                                    </>}
                                </Stack>
                            )}

                            {request.status === 'PAYMENT_PENDING' && (
                                <Box sx={{ textAlign: 'center', py: 2 }}>
                                    <CreditCard size={48} color={binThemeTokens.gold} style={{ margin: '0 auto 16px' }} />
                                    <Typography variant="h6" fontWeight="950" sx={{ mb: 1 }}>ADMIN PAYMENT VERIFICATION PENDING</Typography>
                                    <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>Payment ID: {text(request.paymentId)}</Typography>
                                    <Alert severity="warning" sx={{ mb: 2 }}>Admin must verify the official Cash/Cheque receipt and exact deposit before engineer handoff. Card and bank-transfer payments are disabled.</Alert>
                                    {request.paymentReviewNote && <Alert severity="info">{request.paymentReviewNote}</Alert>}
                                </Box>
                            )}
                        </Paper>

                        <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 0 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <ClipboardList color={binThemeTokens.gold} /> ADMIN / ENGINEER HANDOFF
                            </Typography>
                            <Stack spacing={2}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Building2 size={18} color={binThemeTokens.gold} /><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>Property: {executionScope.propertyName}</Typography></Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><UserCheck size={18} color={binThemeTokens.gold} /><Typography variant="body2">Payer: {text(request.payerRole || (isTenantRequest ? 'tenant' : 'owner')).toUpperCase()}</Typography></Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Clock size={18} color={binThemeTokens.gold} /><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>Engineer Status: {text(request.engineerHandoffStatus || 'WAITING_PAYMENT')}</Typography></Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><FileText size={18} color={binThemeTokens.gold} /><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>Admin Status: {text(request.adminHandoffStatus || 'REQUEST_CREATED')}</Typography></Box>
                            </Stack>

                            {canAdminHandoff && (
                                <Button fullWidth variant="contained" onClick={handleAdminEngineerHandoff} disabled={processing} sx={{ mt: 3, bgcolor: '#10b981', color: '#FFF', fontWeight: 950 }}>
                                    MARK READY FOR ENGINEER REVIEW
                                </Button>
                            )}
                        </Paper>
                    </Stack>
                </Grid>
            </Grid>
        </Container>
    );
}
