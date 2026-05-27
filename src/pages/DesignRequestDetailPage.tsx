import React, { useState, useEffect } from 'react';
import {
    Container, Typography, Box, Paper, Grid, Stack, Button,
    Divider, alpha, CircularProgress, Chip, Alert
} from '@mui/material';
import {
    ArrowLeft, ShieldCheck, CreditCard,
    Clock, FileText, Image as ImageIcon, UserCheck, Building2, ClipboardList
} from 'lucide-react';
import {
    db,
    doc,
    onSnapshot,
    updateDoc,
    serverTimestamp,
    addDoc,
    collection,
    query,
    where,
    getDocs,
    writeBatch,
} from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useParams, useNavigate } from 'react-router-dom';
import { formatAED } from '../utils/formatters';
import { NotificationEvents } from '@bin/shared';
import { logAuditAction } from '../utils/auditLogger';

const terminalStatuses = ['PAYMENT_PENDING', 'PAYMENT_SUBMITTED', 'PAID', 'ENGINEER_REVIEW', 'ADMIN_REVIEW', 'WORK_ORDER_READY', 'OWNER_REJECTED', 'REJECTED'];

function text(value: unknown, fallback = '—') {
    const resolved = String(value ?? '').trim();
    return resolved || fallback;
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
        imageCount: Array.isArray(scope.referenceImages) ? scope.referenceImages.length : 0,
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
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    const currentPath = window.location.pathname;
    const basePrefix = currentPath.includes('/design-studio') ? currentPath.split('/design-studio')[0] : '';

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

    const syncApprovalDocs = async (batch: ReturnType<typeof writeBatch>, action: 'APPROVE' | 'REJECT' | 'TAKEOVER', status: string, approvalStatus: string, payerRole: string, payerId: string | null) => {
        if (!id || !user?.uid) return;
        const approvalSnap = await getDocs(query(collection(db, 'design_approvals'), where('requestId', '==', id)));
        const approvalPayload = {
            decision: action === 'REJECT' ? 'rejected' : 'approved',
            status: approvalStatus,
            approvalStatus,
            payerRole,
            payerId,
            ownerAction: action,
            decidedBy: user.uid,
            decidedByEmail: user.email || null,
            updatedAt: serverTimestamp(),
            ...(action === 'REJECT' ? { rejectedAt: serverTimestamp() } : { approvedAt: serverTimestamp() }),
        };

        if (approvalSnap.empty) {
            const approvalRef = doc(collection(db, 'design_approvals'));
            batch.set(approvalRef, {
                requestId: id,
                propertyId: request?.propertyId || null,
                ownerId: user.uid,
                ownerUid: user.uid,
                tenantUid: request?.tenantUid || request?.userId || null,
                tenantEmail: request?.tenantEmail || null,
                createdAt: serverTimestamp(),
                ...approvalPayload,
            });
            return;
        }

        approvalSnap.docs.forEach((approvalDoc) => {
            batch.update(doc(db, 'design_approvals', approvalDoc.id), approvalPayload);
        });
    };

    const handleOwnerAction = async (action: 'APPROVE' | 'REJECT' | 'TAKEOVER') => {
        if (!id || !request || !user?.uid) return;
        setProcessing(true);
        try {
            const status = action === 'REJECT' ? 'OWNER_REJECTED' : action === 'TAKEOVER' ? 'OWNER_APPROVED_OWNER_TO_PAY' : 'OWNER_APPROVED_TENANT_TO_PAY';
            const approvalStatus = action === 'REJECT' ? 'OWNER_REJECTED' : 'OWNER_APPROVED';
            const quoteStatus = action === 'REJECT' ? 'REJECTED' : 'DEPOSIT_PENDING';
            const payerRole = action === 'TAKEOVER' ? 'owner' : request.role === 'tenant' ? 'tenant' : 'owner';
            const payerId = payerRole === 'owner' ? user.uid : request.userId || request.tenantUid || null;
            const batch = writeBatch(db);

            batch.update(doc(db, 'design_requests', id), {
                status,
                approvalStatus,
                quoteStatus,
                workflowStage: status,
                payerRole,
                payerId,
                ownerId: user.uid,
                ownerUid: user.uid,
                ownerAction: action,
                updatedAt: serverTimestamp(),
                ownerActionAt: serverTimestamp(),
            });

            await syncApprovalDocs(batch, action, status, approvalStatus, payerRole, payerId);
            await batch.commit();

            await logAuditAction({
                actorId: user.uid,
                actorRole: role || 'owner',
                action: `DESIGN_OWNER_${action}`,
                targetType: 'design_requests',
                targetId: id,
                metadata: { payerRole, payerId, quoteTotal: request.quote?.finalTotal || 0, syncedApprovalDocs: true },
            });

            if (action !== 'REJECT' && request.userId && request.role === 'tenant') {
                await NotificationEvents.TENANT.DESIGN_APPROVED(
                    request.userId,
                    request.scope?.zoneType || 'requested area'
                );
            }
        } catch (err) {
            console.error('Design owner action failed:', err);
        } finally {
            setProcessing(false);
        }
    };

    const handleCreatePaymentRequest = async () => {
        if (!id || !request || !user?.uid) return;
        setProcessing(true);
        try {
            const payerRole = request.payerRole || (request.role === 'tenant' ? 'tenant' : 'owner');
            const payerId = request.payerId || user.uid;
            const executionScope = buildExecutionScope(request);
            const amount = Math.round(Number(request.quote?.finalTotal || 0) * 0.15);

            const paymentRef = await addDoc(collection(db, 'payment_transactions'), {
                type: 'DESIGN_STUDIO_EXECUTION',
                source: 'AI_DESIGN_STUDIO',
                designRequestId: id,
                propertyId: request.propertyId || null,
                propertyName: request.propertyName || null,
                ownerId: request.ownerId || null,
                tenantId: request.role === 'tenant' ? request.userId : null,
                payerId,
                payerRole,
                ownerEmail: request.ownerEmail || null,
                ownerName: request.ownerName || null,
                userId: payerId,
                amount,
                amountReceived: 0,
                currency: 'AED',
                status: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
                paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
                verificationState: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
                paymentMethod: 'Manual / Admin Verification',
                internalNotes: 'AI Design Studio execution quote payment pending admin verification.',
                executionScope,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                activationRequestedAt: serverTimestamp(),
            });

            await updateDoc(doc(db, 'design_requests', id), {
                status: 'PAYMENT_PENDING',
                workflowStage: 'PAYMENT_PENDING',
                paymentId: paymentRef.id,
                paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
                executionStatus: 'AWAITING_PAYMENT_VERIFICATION',
                adminHandoffStatus: 'PAYMENT_QUEUE',
                engineerHandoffStatus: 'WAITING_PAYMENT',
                executionScope,
                updatedAt: serverTimestamp(),
                paymentRequestedAt: serverTimestamp(),
            });

            await logAuditAction({
                actorId: user.uid,
                actorRole: role || payerRole,
                action: 'DESIGN_PAYMENT_REQUEST_CREATED',
                targetType: 'design_requests',
                targetId: id,
                metadata: { paymentId: paymentRef.id, amount, payerRole },
            });
        } catch (err) {
            console.error('Design payment request failed:', err);
        } finally {
            setProcessing(false);
        }
    };

    const handleAdminEngineerHandoff = async () => {
        if (!id || !request || !user?.uid) return;
        setProcessing(true);
        try {
            const executionScope = request.executionScope || buildExecutionScope(request);
            await updateDoc(doc(db, 'design_requests', id), {
                status: 'ENGINEER_REVIEW',
                adminHandoffStatus: 'ENGINEER_REVIEW',
                engineerHandoffStatus: 'READY_FOR_SCOPE_REVIEW',
                executionScope,
                updatedAt: serverTimestamp(),
                engineerHandoffAt: serverTimestamp(),
            });

            await logAuditAction({
                actorId: user.uid,
                actorRole: role || 'admin',
                action: 'DESIGN_ENGINEER_HANDOFF_READY',
                targetType: 'design_requests',
                targetId: id,
                metadata: executionScope,
            });
        } catch (err) {
            console.error('Engineer handoff failed:', err);
        } finally {
            setProcessing(false);
        }
    };

    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (!request) return <Container sx={{ py: 10 }}><Typography>Request not found in Sovereign Registry.</Typography></Container>;

    const { scope = {}, quote = {} } = request;
    const isOwner = role === 'owner' || role === 'ceo';
    const isAdmin = ['admin', 'ceo'].includes(String(role || '').toLowerCase());
    const isTenantRequest = request.role === 'tenant';
    const isPayer = request.payerId ? request.payerId === user?.uid : request.userId === user?.uid || request.ownerId === user?.uid;
    const canApprove = isOwner && ['PENDING_OWNER_NOC', 'AWAITING_OWNER_APPROVAL'].includes(String(request.status || ''));
    const canCreatePayment = isPayer && !terminalStatuses.includes(String(request.status || '')) && ['OWNER_APPROVED_TENANT_TO_PAY', 'OWNER_APPROVED_OWNER_TO_PAY', 'DEPOSIT_PENDING', 'AI_CONCEPT_READY'].includes(String(request.status || ''));
    const canAdminHandoff = isAdmin && ['PAYMENT_PENDING', 'PAYMENT_SUBMITTED', 'PAID', 'APPROVED_FOR_EXECUTION', 'READY_FOR_EXECUTION'].includes(String(request.status || ''));
    const referenceImages: string[] = Array.isArray(scope.referenceImages) ? scope.referenceImages : [];
    const executionScope = request.executionScope || buildExecutionScope(request);

    return (
        <Container maxWidth="xl" sx={{ py: 6, pr: { xs: 9, md: 3 }, pb: { xs: 14, md: 8 } }}>
            <Button startIcon={<ArrowLeft />} onClick={() => navigate(`${basePrefix}/design-studio`)} sx={{ color: 'rgba(255,255,255,0.5)', mb: 4, fontWeight: 900 }}>
                BACK TO STUDIO
            </Button>

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
                            {referenceImages[0] ? (
                                <Box component="img" src={referenceImages[0]} sx={{ width: '100%', height: 420, objectFit: 'cover', opacity: 0.85 }} />
                            ) : (
                                <Box sx={{ width: '100%', minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4, textAlign: 'center', bgcolor: 'rgba(15,23,42,0.72)' }}>
                                    <Stack spacing={2} alignItems="center">
                                        <ImageIcon size={48} color="rgba(255,255,255,0.35)" />
                                        <Typography variant="h6" fontWeight={950} sx={{ color: 'rgba(255,255,255,0.78)' }}>NO VISUAL EVIDENCE PROVIDED</Typography>
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.48)', maxWidth: 420 }}>Upload before photos before execution handoff. No demo or stock image is used for production evidence.</Typography>
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
                                        <Alert icon={<ImageIcon size={18} />} severity="warning" sx={{ bgcolor: 'rgba(245,158,11,0.08)', color: '#fbbf24' }}>No reference images uploaded. Execution cannot be treated as visual-evidence complete.</Alert>
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
                                        15% Upfront Deposit Required: {formatAED(Math.round(Number(quote.finalTotal || 0) * 0.15))}
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
                                {quote.bindingClause || 'Scope locked quote. Any hidden condition or owner/admin variation requires updated approval.'}
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
                                <Button variant="contained" fullWidth size="large" onClick={handleCreatePaymentRequest} disabled={processing} sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}>
                                    PAY 15% DEPOSIT ({formatAED(Math.round(Number(quote.finalTotal || 0) * 0.15))})
                                </Button>
                            )}

                            {request.status === 'PAYMENT_PENDING' && (
                                <Box sx={{ textAlign: 'center', py: 2 }}>
                                    <CreditCard size={48} color={binThemeTokens.gold} style={{ margin: '0 auto 16px' }} />
                                    <Typography variant="h6" fontWeight="950" sx={{ mb: 1 }}>AWAITING PAYMENT VERIFICATION</Typography>
                                    <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>Payment ID: {text(request.paymentId)}</Typography>
                                    <Alert severity="warning" sx={{ bgcolor: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}>Admin or payment webhook must verify payment before execution handoff.</Alert>
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
