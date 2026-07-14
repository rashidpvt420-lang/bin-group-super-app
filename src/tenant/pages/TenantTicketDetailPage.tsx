import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    Grid,
    IconButton,
    Paper,
    Rating,
    Stack,
    TextField,
    Typography,
    alpha,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import {
    AlertCircle,
    Ban,
    Calendar,
    CalendarClock,
    Check,
    CheckCircle2,
    ChevronLeft,
    CreditCard,
    Info,
    KeyRound,
    Repeat2,
    RotateCcw,
    ShieldCheck,
    X,
} from 'lucide-react';
import { db, doc, functions, httpsCallable, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { notifyTenantApproved, notifyTenantRejected } from '../../services/notificationService';
import LiveTechnicianTrackingCard from '../../components/tracking/LiveTechnicianTrackingCard';

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
const clean = (value: unknown) => String(value || '').trim();
const statusLabel = (value: unknown) => String(value || 'OPEN').replace(/_/g, ' ').toUpperCase();
const MIN_DISPUTE_REASON = 8;
const POLICY_COPY = '24+ hours before the confirmed appointment: full-refund review. 6–24 hours: 50% refund review. Within 6 hours or no-show: normally non-refundable. Final handling follows the approved contract, payment status and vendor terms.';

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

function timestampDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatDateTime(value: any) {
    const date = timestampDate(value);
    return date ? date.toLocaleString('en-AE') : 'Awaiting confirmation';
}

function policyWindow(ticket: any) {
    const start = timestampDate(ticket?.appointmentStart);
    if (!start) return 'Appointment is not confirmed yet. Cancellation is reviewed before any dispatch.';
    const hours = (start.getTime() - Date.now()) / 3_600_000;
    if (hours >= 24) return 'Current window: eligible for full-refund review if payment has been collected.';
    if (hours >= 6) return 'Current window: eligible for 50% refund review if payment has been collected.';
    return 'Current window: normally non-refundable under the operational policy.';
}

const darkPaper = {
    bgcolor: 'rgba(22,22,24,0.74)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 6,
} as const;

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
    const [notice, setNotice] = useState('');
    const [showReschedule, setShowReschedule] = useState(false);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleWindow, setRescheduleWindow] = useState('09:00-12:00');
    const [rescheduleReason, setRescheduleReason] = useState('');
    const [showCancel, setShowCancel] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [quoteRejectReason, setQuoteRejectReason] = useState('');
    const [accessCode, setAccessCode] = useState('');
    const [accessCodeExpiry, setAccessCodeExpiry] = useState('');

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

    const runScheduledAction = async (action: string, extra: Record<string, unknown> = {}) => {
        if (!id) return;
        setActionLoading(true);
        setError('');
        setNotice('');
        try {
            const manage = httpsCallable(functions, 'tenantManageScheduledService');
            await manage({ ticketId: id, action, ...extra });
            setNotice('Your request was recorded successfully. Operations will see the update immediately.');
        } catch (err: any) {
            console.error('[TenantTicketDetail] scheduled action failed:', err);
            setError(err?.message || 'The scheduled-service action could not be completed.');
        } finally {
            setActionLoading(false);
        }
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

    const saveSecureAccessCode = async () => {
        if (!id) return;
        if (accessCode.trim().length < 4) {
            setError('Enter a temporary access code with at least four characters.');
            return;
        }
        if (!accessCodeExpiry || new Date(accessCodeExpiry).getTime() <= Date.now()) {
            setError('Choose a future access-code expiry.');
            return;
        }
        setActionLoading(true);
        setError('');
        try {
            const saveCode = httpsCallable(functions, 'saveScheduledServiceAccessCode');
            await saveCode({ ticketId: id, code: accessCode.trim(), expiresAt: new Date(accessCodeExpiry).toISOString() });
            setAccessCode('');
            setAccessCodeExpiry('');
            setNotice('The temporary access code was encrypted and saved. Security confirmation is still required.');
        } catch (err: any) {
            console.error(err);
            setError(err?.message || 'The temporary access code could not be saved.');
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
    const isScheduledService = ticket.requestType === 'SCHEDULED_SERVICE';
    const isCancelled = ['CANCELLED', 'CANCELED'].includes(normalizedStatus);
    const beforeProof = firstProof(ticket, 'before');
    const afterProof = firstProof(ticket, 'after');
    const quotePending = ticket.quoteStatus === 'PENDING_TENANT_APPROVAL';
    const canManageScheduledService = isScheduledService && !isCancelled && !isClosed && !isCompleted;

    return (
        <Box sx={{ maxWidth: 1000, mx: 'auto', pb: 10 }}>
            {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
            {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                <IconButton onClick={() => navigate('/tenant/tickets')} sx={{ color: 'rgba(255,255,255,0.5)' }}><ChevronLeft /></IconButton>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{isScheduledService ? 'SCHEDULED SERVICE RECORD' : 'TICKET RECORD'}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>#{ticket.id.substring(0, 8)}</Typography>
                </Box>
            </Stack>

            {isScheduledService && (
                <Stack spacing={3} sx={{ mb: 4 }}>
                    <Paper sx={{ ...darkPaper, p: { xs: 2.5, md: 4 } }}>
                        <Stack spacing={3}>
                            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
                                <Box>
                                    <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 950 }}>{ticket.serviceLabel || ticket.category || 'Scheduled service'}</Typography>
                                    <Typography sx={{ color: 'rgba(255,255,255,0.62)', mt: 0.5 }}>{ticket.operationsSummary || ticket.description}</Typography>
                                </Box>
                                <Chip label={statusLabel(ticket.status)} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.18), color: binThemeTokens.gold, fontWeight: 950 }} />
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                            <Grid container spacing={2}>
                                <Grid item xs={12} md={6}><InfoRow icon={<CalendarClock size={18} />} label="Appointment" value={ticket.appointmentStatus === 'CONFIRMED' ? formatDateTime(ticket.appointmentStart) : `${ticket.preferredServiceDate || ticket.requestedServiceDate || 'Date pending'} · ${ticket.preferredTimeWindow || 'Time pending'}`} /></Grid>
                                <Grid item xs={12} md={6}><InfoRow icon={<Calendar size={18} />} label="Appointment status" value={statusLabel(ticket.appointmentStatus || 'PENDING_CONFIRMATION')} /></Grid>
                                <Grid item xs={12} md={6}><InfoRow icon={<CreditCard size={18} />} label="Quote" value={ticket.quotedPrice ? `AED ${Number(ticket.quotedPrice).toFixed(2)} · ${statusLabel(ticket.quoteStatus)}` : 'Operations quote pending'} /></Grid>
                                <Grid item xs={12} md={6}><InfoRow icon={<ShieldCheck size={18} />} label="Payment" value={statusLabel(ticket.servicePaymentStatus || (ticket.paymentVerified ? 'PAID' : 'NOT_PAID'))} /></Grid>
                                <Grid item xs={12} md={6}><InfoRow icon={<Repeat2 size={18} />} label="Recurrence" value={ticket.recurrenceFrequency && ticket.recurrenceFrequency !== 'one-time' ? `${statusLabel(ticket.recurrenceFrequency)} · visit ${ticket.recurrenceSequence || 1} of ${ticket.recurrenceOccurrences || 1}` : 'ONE-TIME'} /></Grid>
                                <Grid item xs={12} md={6}><InfoRow icon={<KeyRound size={18} />} label="Access" value={`${statusLabel(ticket.accessMethod || 'tenant-present')} · ${statusLabel(ticket.securityAccessStatus || 'PENDING_CONFIRMATION')}`} /></Grid>
                            </Grid>
                        </Stack>
                    </Paper>

                    {quotePending && (
                        <Paper sx={{ p: { xs: 2.5, md: 4 }, bgcolor: alpha('#2563EB', 0.08), border: '1px solid rgba(37,99,235,0.4)', borderRadius: 6 }}>
                            <Typography variant="h6" sx={{ color: '#60A5FA', fontWeight: 950, mb: 1 }}>QUOTE APPROVAL REQUIRED</Typography>
                            <Typography sx={{ color: '#FFF', fontSize: '1.45rem', fontWeight: 950 }}>AED {Number(ticket.quotedPrice || 0).toFixed(2)}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', mt: 1 }}>No paid service is dispatched until you approve this quote. Quote expiry: {formatDateTime(ticket.quoteExpiresAt)}.</Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3 }}>
                                <Button fullWidth variant="contained" color="success" startIcon={<Check />} disabled={actionLoading} onClick={() => runScheduledAction('approve_quote')} sx={{ fontWeight: 950 }}>APPROVE QUOTE</Button>
                                <TextField fullWidth label="Reason if declining" value={quoteRejectReason} onChange={(event) => setQuoteRejectReason(event.target.value)} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} />
                                <Button fullWidth variant="outlined" color="error" startIcon={<X />} disabled={actionLoading} onClick={() => runScheduledAction('reject_quote', { reason: quoteRejectReason })} sx={{ fontWeight: 950 }}>DECLINE QUOTE</Button>
                            </Stack>
                        </Paper>
                    )}

                    <Paper sx={{ p: { xs: 2.5, md: 4 }, bgcolor: alpha('#F59E0B', 0.06), border: '1px solid rgba(245,158,11,0.28)', borderRadius: 6 }}>
                        <Typography variant="h6" sx={{ color: '#FBBF24', fontWeight: 950 }}>CANCELLATION & REFUND POLICY</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 1, lineHeight: 1.7 }}>{ticket.policyAcknowledgement || POLICY_COPY}</Typography>
                        <Typography variant="body2" sx={{ color: '#FFF', mt: 1.5, fontWeight: 800 }}>{policyWindow(ticket)}</Typography>
                        {ticket.cancellationStatus && <Chip sx={{ mt: 2 }} label={`${statusLabel(ticket.cancellationStatus)} · ${statusLabel(ticket.refundStatus || 'NO REFUND DECISION')}`} />}
                    </Paper>

                    {ticket.accessMethod === 'smart-lock' && (
                        <Paper sx={{ p: { xs: 2.5, md: 4 }, bgcolor: alpha('#7C3AED', 0.07), border: '1px solid rgba(124,58,237,0.32)', borderRadius: 6 }}>
                            <Stack spacing={2}>
                                <Typography variant="h6" sx={{ color: '#C4B5FD', fontWeight: 950 }}>SECURE TEMPORARY ACCESS</Typography>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>Stored code ending: {ticket.accessCodeLast4 ? `••••${ticket.accessCodeLast4}` : 'No active code'} · Expiry: {formatDateTime(ticket.accessCodeExpiresAt)} · Security: {statusLabel(ticket.securityAccessStatus || 'PENDING')}</Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} md={5}><TextField fullWidth type="password" label="New temporary access code" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} inputProps={{ maxLength: 32 }} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} /></Grid>
                                    <Grid item xs={12} md={5}><TextField fullWidth type="datetime-local" label="Code expiry" value={accessCodeExpiry} onChange={(event) => setAccessCodeExpiry(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} /></Grid>
                                    <Grid item xs={12} md={2}><Button fullWidth variant="contained" disabled={actionLoading} onClick={saveSecureAccessCode} sx={{ height: '100%', minHeight: 56, bgcolor: '#7C3AED', fontWeight: 950 }}>SAVE</Button></Grid>
                                </Grid>
                            </Stack>
                        </Paper>
                    )}

                    {canManageScheduledService && (
                        <Paper sx={{ ...darkPaper, p: { xs: 2.5, md: 4 } }}>
                            <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950, mb: 2 }}>MANAGE APPOINTMENT</Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                <Button fullWidth variant="outlined" startIcon={<RotateCcw />} onClick={() => setShowReschedule((value) => !value)} sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.5), fontWeight: 950 }}>REQUEST RESCHEDULE</Button>
                                <Button fullWidth variant="outlined" color="error" startIcon={<Ban />} onClick={() => setShowCancel((value) => !value)} sx={{ fontWeight: 950 }}>REQUEST CANCELLATION</Button>
                            </Stack>
                            {showReschedule && (
                                <Stack spacing={2} sx={{ mt: 3 }}>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} md={4}><TextField fullWidth type="date" label="Preferred new date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} /></Grid>
                                        <Grid item xs={12} md={4}><TextField fullWidth select label="Preferred time" value={rescheduleWindow} onChange={(event) => setRescheduleWindow(event.target.value)} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }}>{['09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00'].map((window) => <option key={window} value={window}>{window}</option>)}</TextField></Grid>
                                        <Grid item xs={12} md={4}><TextField fullWidth label="Reason" value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} /></Grid>
                                    </Grid>
                                    <Button variant="contained" disabled={actionLoading} onClick={() => runScheduledAction('request_reschedule', { preferredDate: rescheduleDate, preferredTimeWindow: rescheduleWindow, reason: rescheduleReason })} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>SUBMIT RESCHEDULE REQUEST</Button>
                                </Stack>
                            )}
                            {showCancel && (
                                <Stack spacing={2} sx={{ mt: 3 }}>
                                    <TextField fullWidth multiline rows={3} label="Cancellation reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} />
                                    <Button variant="contained" color="error" disabled={actionLoading} onClick={() => runScheduledAction('request_cancel', { reason: cancelReason })} sx={{ fontWeight: 950 }}>SUBMIT CANCELLATION REQUEST</Button>
                                </Stack>
                            )}
                        </Paper>
                    )}
                </Stack>
            )}

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, mb: 4, ...darkPaper }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
                            <Box><Typography variant="h5" fontWeight="950" color="#FFF">{ticket.category || ticket.complaintCategory || ticket.trade || 'Maintenance Request'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}><Calendar size={12} /> {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : 'Just now'}</Typography></Box>
                            <Chip label={statusLabel(ticket.status)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.7rem' }} />
                        </Stack>
                        <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Stack spacing={2}><Box><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>LOCATION</Typography><Typography color="#FFF" fontWeight={700}>{ticket.specificLocation || ticket.propertyLocation?.address || ticket.address || 'General Residence'}</Typography></Box><Box><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>DESCRIPTION</Typography><Typography color="rgba(255,255,255,0.8)" sx={{ mt: 0.5, lineHeight: 1.7 }}>{ticket.description || 'No description recorded.'}</Typography></Box></Stack>
                    </Paper>

                    {isCompleted && <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid #10b981', borderRadius: 6 }}><Typography variant="h6" fontWeight="950" color="#10b981" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}><CheckCircle2 /> WORK COMPLETED — REVIEW REQUIRED</Typography><Typography variant="body2" color="rgba(255,255,255,0.6)" sx={{ mb: 3 }}>Approve to close the ticket, or dispute with a clear reason. This writes the final closure packet and audit trail.</Typography>{ticket.technicianNotes && <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(255,255,255,0.03)' }}><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>TECHNICIAN NOTES</Typography><Typography color="#FFF">{ticket.technicianNotes}</Typography></Paper>}{(beforeProof || afterProof) && <Grid container spacing={2} sx={{ mb: 3 }}><Grid item xs={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>BEFORE</Typography>{beforeProof ? <Box component="img" src={beforeProof} sx={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 3, mt: 1 }} /> : <Paper sx={{ height: 180, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}><Info /></Paper>}</Grid><Grid item xs={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>AFTER</Typography>{afterProof ? <Box component="img" src={afterProof} sx={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 3, mt: 1 }} /> : <Paper sx={{ height: 180, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}><Info /></Paper>}</Grid></Grid>}<Paper sx={{ p: 3, mb: 3, bgcolor: 'rgba(255,255,255,0.03)' }}><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>RATE SERVICE</Typography><Rating value={rating} onChange={(_, next) => setRating(next || 1)} size="large" sx={{ display: 'block', my: 1, '& .MuiRating-iconFilled': { color: binThemeTokens.gold } }} /><TextField fullWidth multiline rows={3} label="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} /></Paper>{!showRejectInput ? <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button fullWidth variant="contained" color="success" startIcon={actionLoading ? <CircularProgress size={18} color="inherit" /> : <Check />} onClick={approveCompletion} disabled={actionLoading || !rating} sx={{ fontWeight: 950 }}>APPROVE, RATE & CLOSE</Button><Button fullWidth variant="outlined" color="error" startIcon={<X />} onClick={() => setShowRejectInput(true)} disabled={actionLoading} sx={{ fontWeight: 950 }}>DISPUTE SERVICE</Button></Stack> : <Stack spacing={2}><TextField fullWidth multiline rows={3} label="Reason for disputing resolution" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} helperText={`Minimum ${MIN_DISPUTE_REASON} characters`} sx={{ '& .MuiOutlinedInput-root': { color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.45)' } }} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button fullWidth variant="contained" color="error" onClick={disputeCompletion} disabled={actionLoading || clean(rejectReason || feedback).length < MIN_DISPUTE_REASON} sx={{ fontWeight: 950 }}>CONFIRM DISPUTE</Button><Button fullWidth onClick={() => setShowRejectInput(false)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CANCEL</Button></Stack></Stack>}</Paper>}
                    {isDisputed && <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#ef4444', 0.05), border: '1px solid #ef4444', borderRadius: 6 }}><Typography variant="h6" fontWeight="950" color="#ef4444" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}><AlertCircle /> JOB DISPUTED</Typography><Typography variant="body2" color="rgba(255,255,255,0.6)">Property Management is reviewing the case.</Typography><Typography color="#FFF" sx={{ mt: 2 }}>{ticket.rejectionReason || ticket.disputeReason || ticket.feedback}</Typography></Paper>}
                    {isClosed && <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, textAlign: 'center' }}><CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 16px' }} /><Typography variant="h6" fontWeight="950" color="#10b981">SERVICE FINALIZED</Typography>{ticket.rating && <Rating readOnly value={Number(ticket.rating)} sx={{ '& .MuiRating-iconFilled': { color: binThemeTokens.gold } }} />}{ticket.feedback && <Typography variant="body2" color="rgba(255,255,255,0.75)" sx={{ mt: 1, fontStyle: 'italic' }}>{ticket.feedback}</Typography>}</Paper>}
                </Grid>
                <Grid item xs={12} lg={4}><Box sx={{ mb: 3 }}><LiveTechnicianTrackingCard ticket={ticket} onChatClick={() => navigate(`/tenant/chat/${ticket.id}`)} showTimeline={true} /></Box><Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.02), border: '1px solid rgba(255,255,255,0.03)', borderRadius: 5 }}><Typography variant="subtitle2" fontWeight="950" color={binThemeTokens.gold} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}><Info size={16} /> NEED ASSISTANCE?</Typography><Typography variant="caption" color="rgba(255,255,255,0.4)" sx={{ fontWeight: 700 }}>Use chat to reach your assigned team. For quote, scheduling, access or refund escalation, contact BIN GROUP Operations.</Typography></Paper></Grid>
            </Grid>
        </Box>
    );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, height: '100%' }}>
            <Stack direction="row" spacing={1.25} alignItems="flex-start">
                <Box sx={{ color: binThemeTokens.gold, mt: 0.2 }}>{icon}</Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 900 }}>{label.toUpperCase()}</Typography>
                    <Typography sx={{ color: '#FFF', fontWeight: 800, overflowWrap: 'anywhere' }}>{value}</Typography>
                </Box>
            </Stack>
        </Box>
    );
}
