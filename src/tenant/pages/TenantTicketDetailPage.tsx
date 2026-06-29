import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Grid, IconButton, Paper, Rating, Stack, TextField, Typography, alpha } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Calendar, Check, CheckCircle2, ChevronLeft, Info, X } from 'lucide-react';
import { addDoc, collection, db, doc, onSnapshot, serverTimestamp, updateDoc, functions, httpsCallable } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { notifyTenantApproved, notifyTenantRejected } from '../../services/notificationService';
import LiveTechnicianTrackingCard from '../../components/tracking/LiveTechnicianTrackingCard';

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
const clean = (value: unknown) => String(value || '').trim();
const statusLabel = (value: unknown) => String(value || 'OPEN').replace(/_/g, ' ').toUpperCase();
const MIN_DISPUTE_REASON = 8;

function tenantCanReadTicket(ticket: any, user: any) {
    if (!ticket || !user?.uid) return false;
    const uid = String(user.uid);
    const email = normalize(user.email);
    return ticket.tenantId === uid || ticket.tenantUid === uid || ticket.userId === uid || ticket.createdBy === uid || ticket.createdByUid === uid || ticket.requesterId === uid || normalize(ticket.tenantEmail) === email || normalize(ticket.reporterEmail) === email || normalize(ticket.requesterEmail) === email || normalize(ticket.email) === email;
}

function firstProof(ticket: any, kind: 'before' | 'after') {
    const values = kind === 'before'
        ? [ticket?.beforePhotos?.[0], ticket?.beforePhotoUrl, ticket?.photos?.[0], ticket?.tenantPhotos?.[0]]
        : [ticket?.afterPhotos?.[0], ticket?.completionPhotos?.[0], ticket?.proofPhotos?.[0], ticket?.evidencePhotos?.[0], ticket?.afterPhotoUrl];
    return values.find(Boolean) || '';
}

export default function TenantTicketDetailPage() {
    const { id } = useParams();
    const { user } = useRole();
    const navigate = useNavigate();
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [showRejectInput, setShowRejectInput] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [rating, setRating] = useState<number | null>(5);
    const [feedback, setFeedback] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!id || !user?.uid) return;
        const unsubscribe = onSnapshot(doc(db, 'maintenanceTickets', id), (snap) => {
            if (!snap.exists()) {
                setTicket(null);
                setLoading(false);
                return;
            }
            const data = snap.data();
            if (!tenantCanReadTicket(data, user)) {
                navigate('/tenant/tickets');
                return;
            }
            setTicket({ id: snap.id, ...data });
            if (data.rating && !rating) setRating(Number(data.rating));
            if (data.feedback && !feedback) setFeedback(String(data.feedback));
            setLoading(false);
        }, (err) => {
            console.error('[TenantTicketDetail] Listener error:', err);
            setError(err?.message || 'Ticket listener failed.');
            setLoading(false);
        });
        return () => unsubscribe();
    }, [id, user, navigate, rating, feedback]);

    const writeAudit = async (payload: Record<string, any>) => {
        await Promise.all([
            addDoc(collection(db, 'audit_logs'), payload),
            addDoc(collection(db, 'auditLogs'), { ...payload, timestamp: serverTimestamp() }),
        ]);
    };

    const approveCompletion = async () => {
        if (!id || !user || !rating) return;
        setActionLoading(true);
        setError('');
        const safeRating = Math.max(1, Math.min(5, Number(rating || 5)));
        const cleanFeedback = clean(feedback) || 'Approved by tenant. Service completed successfully.';
        try {
            const tenantReviewTicketCompletion = httpsCallable(functions, 'tenantReviewTicketCompletion');
            await tenantReviewTicketCompletion({ ticketId: id, action: 'approve', rating: safeRating, feedback: cleanFeedback });
            
            setTicket((prev: any) => ({ ...prev, status: 'CLOSED', closureStatus: 'TENANT_APPROVED_CLOSED', tenantApproved: true, tenantApprovalStatus: 'APPROVED', rating: safeRating, feedback: cleanFeedback, tenantFeedback: cleanFeedback }));
            notifyTenantApproved(id, user.displayName || 'Tenant').catch(console.warn);
        } catch (err: any) {
            console.error(err);
            setError(err?.message || 'Could not submit approval. Please try again.');
        } finally {
            setActionLoading(false);
        }
    };

    const disputeCompletion = async () => {
        if (!id || !user) return;
        const reason = clean(rejectReason || feedback);
        if (reason.length < MIN_DISPUTE_REASON) {
            setError('Enter a clear dispute reason before rejecting the completed work.');
            return;
        }
        setActionLoading(true);
        setError('');
        try {
            const tenantReviewTicketCompletion = httpsCallable(functions, 'tenantReviewTicketCompletion');
            await tenantReviewTicketCompletion({ ticketId: id, action: 'dispute', disputeReason: reason });
            
            setTicket((prev: any) => ({ ...prev, status: 'DISPUTED', closureStatus: 'TENANT_DISPUTED_REOPENED_FOR_REVIEW', tenantApproved: false, tenantApprovalStatus: 'DISPUTED', disputeStatus: 'OPEN_ADMIN_REVIEW', rating: rating || 1, feedback: reason, rejectionReason: reason, disputeReason: reason }));
            notifyTenantRejected(id, user.displayName || 'Tenant', reason).catch(console.warn);
            setShowRejectInput(false);
        } catch (err: any) {
            console.error(err);
            setError(err?.message || 'Could not submit dispute. Please try again.');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (!ticket) return null;

    const normalizedStatus = statusLabel(ticket.status);
    const isCompleted = ['COMPLETED', 'COMPLETED PENDING APPROVAL', 'COMPLETED PENDING TENANT APPROVAL', 'PENDING TENANT REVIEW'].includes(normalizedStatus) && ticket.tenantApproved !== true;
    const isDisputed = normalizedStatus === 'DISPUTED' || ticket.tenantApprovalStatus === 'DISPUTED';
    const isClosed = normalizedStatus === 'CLOSED' || ticket.tenantApproved === true || ticket.tenantApprovalStatus === 'APPROVED';
    const beforeProof = firstProof(ticket, 'before');
    const afterProof = firstProof(ticket, 'after');

    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', pb: 10 }}>
            {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                <IconButton onClick={() => navigate('/tenant/tickets')} sx={{ color: 'rgba(255,255,255,0.5)' }}><ChevronLeft /></IconButton>
                <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>TICKET RECORD</Typography><Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>#{ticket.id.substring(0, 8)}</Typography></Box>
            </Stack>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22,22,24,0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}><Box><Typography variant="h5" fontWeight="950" color="#FFF">{ticket.category || ticket.complaintCategory || ticket.trade || 'Maintenance Request'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}><Calendar size={12} /> {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : 'Just now'}</Typography></Box><Chip label={statusLabel(ticket.status)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.7rem' }} /></Stack>
                        <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Stack spacing={2}><Box><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>LOCATION</Typography><Typography color="#FFF" fontWeight={700}>{ticket.specificLocation || ticket.propertyLocation?.address || ticket.address || 'General Residence'}</Typography></Box><Box><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>DESCRIPTION</Typography><Typography color="rgba(255,255,255,0.8)" sx={{ mt: 0.5, lineHeight: 1.7 }}>{ticket.description || 'No description recorded.'}</Typography></Box></Stack>
                    </Paper>

                    {isCompleted && <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid #10b981', borderRadius: 6 }}><Typography variant="h6" fontWeight="950" color="#10b981" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}><CheckCircle2 /> WORK COMPLETED — REVIEW REQUIRED</Typography><Typography variant="body2" color="rgba(255,255,255,0.6)" sx={{ mb: 3 }}>Approve to close the ticket, or dispute with a clear reason. This writes the final closure packet and audit trail.</Typography>{ticket.technicianNotes && <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(255,255,255,0.03)' }}><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>TECHNICIAN NOTES</Typography><Typography color="#FFF">{ticket.technicianNotes}</Typography></Paper>}{(beforeProof || afterProof) && <Grid container spacing={2} sx={{ mb: 3 }}><Grid item xs={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>BEFORE</Typography>{beforeProof ? <Box component="img" src={beforeProof} sx={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 3, mt: 1 }} /> : <Paper sx={{ height: 180, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}><Info /></Paper>}</Grid><Grid item xs={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>AFTER</Typography>{afterProof ? <Box component="img" src={afterProof} sx={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 3, mt: 1 }} /> : <Paper sx={{ height: 180, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}><Info /></Paper>}</Grid></Grid>}<Paper sx={{ p: 3, mb: 3, bgcolor: 'rgba(255,255,255,0.03)' }}><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>RATE SERVICE</Typography><Rating value={rating} onChange={(_, next) => setRating(next || 1)} size="large" sx={{ display: 'block', my: 1, '& .MuiRating-iconFilled': { color: binThemeTokens.gold } }} /><TextField fullWidth multiline rows={3} label="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} /></Paper>{!showRejectInput ? <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button fullWidth variant="contained" color="success" startIcon={actionLoading ? <CircularProgress size={18} color="inherit" /> : <Check />} onClick={approveCompletion} disabled={actionLoading || !rating} sx={{ fontWeight: 950 }}>APPROVE, RATE & CLOSE</Button><Button fullWidth variant="outlined" color="error" startIcon={<X />} onClick={() => setShowRejectInput(true)} disabled={actionLoading} sx={{ fontWeight: 950 }}>DISPUTE SERVICE</Button></Stack> : <Stack spacing={2}><TextField fullWidth multiline rows={3} label="Reason for disputing resolution" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} helperText={`Minimum ${MIN_DISPUTE_REASON} characters`} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.45)' } }} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button fullWidth variant="contained" color="error" onClick={disputeCompletion} disabled={actionLoading || clean(rejectReason || feedback).length < MIN_DISPUTE_REASON} sx={{ fontWeight: 950 }}>CONFIRM DISPUTE</Button><Button fullWidth onClick={() => setShowRejectInput(false)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CANCEL</Button></Stack></Stack>}</Paper>}
                    {isDisputed && <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#ef4444', 0.05), border: '1px solid #ef4444', borderRadius: 6 }}><Typography variant="h6" fontWeight="950" color="#ef4444" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}><AlertCircle /> JOB DISPUTED</Typography><Typography variant="body2" color="rgba(255,255,255,0.6)">Property Management is reviewing the case.</Typography><Typography color="#FFF" sx={{ mt: 2 }}>{ticket.rejectionReason || ticket.disputeReason || ticket.feedback}</Typography></Paper>}
                    {isClosed && <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, textAlign: 'center' }}><CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 16px' }} /><Typography variant="h6" fontWeight="950" color="#10b981">SERVICE FINALIZED</Typography>{ticket.rating && <Rating readOnly value={Number(ticket.rating)} sx={{ '& .MuiRating-iconFilled': { color: binThemeTokens.gold } }} />}{ticket.feedback && <Typography variant="body2" color="rgba(255,255,255,0.75)" sx={{ mt: 1, fontStyle: 'italic' }}>{ticket.feedback}</Typography>}</Paper>}
                </Grid>
                <Grid item xs={12} lg={4}><Box sx={{ mb: 3 }}><LiveTechnicianTrackingCard ticket={ticket} onChatClick={() => navigate(`/tenant/chat/${ticket.id}`)} showTimeline={true} /></Box><Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.02), border: '1px solid rgba(255,255,255,0.03)', borderRadius: 5 }}><Typography variant="subtitle2" fontWeight="950" color={binThemeTokens.gold} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}><Info size={16} /> NEED ASSISTANCE?</Typography><Typography variant="caption" color="rgba(255,255,255,0.4)" sx={{ fontWeight: 700 }}>Use chat to reach your technician. For escalations, contact BIN GROUP concierge.</Typography></Paper></Grid>
            </Grid>
        </Box>
    );
}
