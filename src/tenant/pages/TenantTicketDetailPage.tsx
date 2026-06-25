import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Stack, Chip, CircularProgress,
    Button, Divider, TextField, Grid, alpha, IconButton, ImageList, ImageListItem, Rating
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { MessageSquare, Check, X, ChevronLeft, Calendar, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { db, doc, onSnapshot, updateDoc, serverTimestamp, addDoc, collection } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { notifyTenantApproved, notifyTenantRejected } from '../../services/notificationService';
import LiveTechnicianTrackingCard from '../../components/tracking/LiveTechnicianTrackingCard';

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

function tenantCanReadTicket(ticket: any, user: any) {
    if (!ticket || !user?.uid) return false;
    const uid = String(user.uid);
    const email = normalize(user.email);
    return ticket.tenantId === uid ||
        ticket.tenantUid === uid ||
        ticket.userId === uid ||
        ticket.createdBy === uid ||
        ticket.createdByUid === uid ||
        ticket.requesterId === uid ||
        normalize(ticket.tenantEmail) === email ||
        normalize(ticket.reporterEmail) === email ||
        normalize(ticket.requesterEmail) === email ||
        normalize(ticket.email) === email;
}

export default function TenantTicketDetailPage() {
    const { id } = useParams();
    const { user } = useRole();
    const navigate = useNavigate();
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showRejectInput, setShowRejectInput] = useState(false);
    const [rating, setRating] = useState<number | null>(5);
    const [feedback, setFeedback] = useState('');

    useEffect(() => {
        if (!id || !user?.uid) return;
        const unsub = onSnapshot(doc(db, 'maintenanceTickets', id), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (tenantCanReadTicket(data, user)) {
                    setTicket({ id: snap.id, ...data });
                    if (data.rating && !rating) setRating(Number(data.rating));
                    if (data.feedback && !feedback) setFeedback(String(data.feedback));
                } else {
                    alert('Ticket not found or unauthorized');
                    navigate('/tenant/tickets');
                }
            }
            setLoading(false);
        }, (err) => {
            console.error('[TenantTicketDetail] Listener error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, [id, user, navigate, rating, feedback]);

    const handleApprove = async () => {
        if (!id || !user || !rating) return;
        setActionLoading(true);
        const safeRating = Math.max(1, Math.min(5, Number(rating || 5)));
        const cleanFeedback = feedback.trim() || 'Approved by tenant. Service completed successfully.';
        try {
            await updateDoc(doc(db, 'maintenanceTickets', id), {
                status: 'CLOSED',
                tenantApproved: true,
                rating: safeRating,
                feedback: cleanFeedback,
                closedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            await addDoc(collection(db, 'audit_logs'), {
                action: 'TENANT_APPROVED_COMPLETION_WITH_FEEDBACK',
                ticketId: id,
                actorId: user.uid,
                actorRole: 'tenant',
                rating: safeRating,
                feedback: cleanFeedback,
                timestamp: serverTimestamp()
            });
            setTicket((prev: any) => ({ ...prev, status: 'CLOSED', tenantApproved: true, rating: safeRating, feedback: cleanFeedback }));
            notifyTenantApproved(id, user.displayName || 'Tenant').catch(console.warn);
        } catch (err) {
            console.error(err);
            alert('Could not submit feedback. Please try again.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!id || !user) return;
        const cleanReason = (rejectReason || feedback).trim();
        if (!cleanReason) return;
        setActionLoading(true);
        try {
            await updateDoc(doc(db, 'maintenanceTickets', id), {
                status: 'DISPUTED',
                tenantApproved: false,
                rating: rating || 1,
                feedback: cleanReason,
                rejectionReason: cleanReason,
                updatedAt: serverTimestamp()
            });
            await addDoc(collection(db, 'audit_logs'), {
                action: 'TENANT_DISPUTED_COMPLETION_WITH_FEEDBACK',
                ticketId: id,
                actorId: user.uid,
                actorRole: 'tenant',
                rating: rating || 1,
                reason: cleanReason,
                timestamp: serverTimestamp()
            });
            setTicket((prev: any) => ({ ...prev, status: 'DISPUTED', tenantApproved: false, rating: rating || 1, feedback: cleanReason, rejectionReason: cleanReason }));
            notifyTenantRejected(id, user.displayName || 'Tenant', cleanReason).catch(console.warn);
            setShowRejectInput(false);
        } catch (err) {
            console.error(err);
            alert('Could not submit dispute. Please try again.');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (!ticket) return null;

    const normalizedStatus = String(ticket.status || '').toUpperCase();
    const isCompleted = ['COMPLETED', 'COMPLETED_PENDING_APPROVAL', 'COMPLETED_PENDING_TENANT_APPROVAL'].includes(normalizedStatus) && ticket.tenantApproved !== true;
    const isDisputed = normalizedStatus === 'DISPUTED';
    const isClosed = normalizedStatus === 'CLOSED' || ticket.tenantApproved === true;
    const afterProof = ticket.afterPhotos?.[0] || ticket.completionPhotos?.[0] || ticket.proofPhotos?.[0] || ticket.evidencePhotos?.[0] || ticket.afterPhotoUrl;
    const beforeProof = ticket.beforePhotos?.[0] || ticket.beforePhotoUrl || ticket.photos?.[0] || ticket.tenantPhotos?.[0];

    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', pb: 10 }}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                <IconButton onClick={() => navigate('/tenant/tickets')} sx={{ color: 'rgba(255,255,255,0.5)' }}><ChevronLeft /></IconButton>
                <Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>TICKET RECORD</Typography><Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', letterSpacing: -1 }}>#{ticket.id.substring(0,8)}</Typography></Box>
            </Stack>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}><Box><Typography variant="h5" fontWeight="950" color="#FFF">{ticket.category || ticket.complaintCategory || ticket.trade || 'Maintenance Request'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}><Calendar size={12} /> {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : 'Just now'}</Typography></Box><Chip label={String(ticket.status || 'OPEN').replace(/_/g, ' ')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.7rem' }} /></Stack>
                        <Divider sx={{ mb: 4, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Stack spacing={3}><Box><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>SPECIFIC LOCATION</Typography><Typography variant="body1" color="#FFF" sx={{ mt: 0.5, fontWeight: 700 }}>{ticket.specificLocation || ticket.propertyLocation?.address || ticket.address || 'General Residence'}</Typography></Box><Box><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>DESCRIPTION</Typography><Typography variant="body1" color="rgba(255,255,255,0.8)" sx={{ mt: 1, lineHeight: 1.7 }}>{ticket.description}</Typography></Box>{ticket.photos && ticket.photos.length > 0 && <Box><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, mb: 2, display: 'block' }}>SUBMITTED PHOTOS</Typography><ImageList sx={{ width: '100%', borderRadius: 4, overflow: 'hidden' }} cols={3} gap={8}>{ticket.photos.map((url: string, index: number) => <ImageListItem key={index}><img src={url} alt={`issue-${index}`} loading="lazy" style={{ height: 150, objectFit: 'cover' }} /></ImageListItem>)}</ImageList></Box>}</Stack>
                    </Paper>

                    {isCompleted && <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid #10b981', borderRadius: 6 }}><Typography variant="h6" fontWeight="950" color="#10b981" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}><CheckCircle2 /> WORK COMPLETED — REVIEW REQUIRED</Typography><Typography variant="body2" color="rgba(255,255,255,0.6)" sx={{ mb: 4 }}>Please check the work, rate the technician, and either approve the service or dispute it with a reason. Your rating will be saved on the ticket record.</Typography>{ticket.technicianNotes && <Box sx={{ mb: 4, p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>TECHNICIAN RESOLUTION NOTES</Typography><Typography variant="body1" color="#FFF" sx={{ mt: 0.5 }}>{ticket.technicianNotes}</Typography></Box>}{(beforeProof || afterProof) && <Grid container spacing={2} sx={{ mb: 4 }}><Grid item xs={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, mb: 1, display: 'block' }}>BEFORE</Typography><Box sx={{ borderRadius: 3, overflow: 'hidden', pt: '75%', position: 'relative', bgcolor: 'rgba(0,0,0,0.3)' }}>{beforeProof ? <img src={beforeProof} alt="Before maintenance" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <Info style={{ position: 'absolute', top: '40%', left: '40%', opacity: 0.2 }} />}</Box></Grid><Grid item xs={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, mb: 1, display: 'block' }}>AFTER</Typography><Box sx={{ borderRadius: 3, overflow: 'hidden', pt: '75%', position: 'relative', bgcolor: 'rgba(0,0,0,0.3)' }}>{afterProof ? <img src={afterProof} alt="After maintenance" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <Info style={{ position: 'absolute', top: '40%', left: '40%', opacity: 0.2 }} />}</Box></Grid></Grid>}<Box sx={{ mb: 3, p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'block', mb: 1 }}>RATE TECHNICIAN SERVICE</Typography><Rating value={rating} onChange={(_, nextValue) => setRating(nextValue || 1)} size="large" sx={{ mb: 2, '& .MuiRating-iconFilled': { color: binThemeTokens.gold }, '& .MuiRating-iconEmpty': { color: 'rgba(255,255,255,0.25)' } }} /><TextField fullWidth multiline rows={3} label="Feedback for technician / BIN GROUP" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Example: Technician arrived on time and fixed the issue properly." sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} /></Box>{!showRejectInput ? <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button fullWidth variant="contained" color="success" startIcon={actionLoading ? <CircularProgress size={18} color="inherit" /> : <Check />} onClick={handleApprove} disabled={actionLoading || !rating} sx={{ fontWeight: 950, py: 1.5, borderRadius: 3 }}>APPROVE, RATE & CLOSE</Button><Button fullWidth variant="outlined" color="error" startIcon={<X />} onClick={() => setShowRejectInput(true)} disabled={actionLoading} sx={{ fontWeight: 950, py: 1.5, borderRadius: 3 }}>DISPUTE SERVICE</Button></Stack> : <Stack spacing={2}><TextField fullWidth multiline rows={3} label="Reason for disputing resolution" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' }, '& label': { color: 'rgba(255,255,255,0.5)' } }} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button fullWidth variant="contained" color="error" onClick={handleReject} disabled={actionLoading || !(rejectReason || feedback).trim()} sx={{ fontWeight: 950, borderRadius: 3 }}>CONFIRM DISPUTE</Button><Button fullWidth variant="text" onClick={() => setShowRejectInput(false)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CANCEL</Button></Stack></Stack>}</Paper>}

                    {isDisputed && <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#ef4444', 0.05), border: '1px solid #ef4444', borderRadius: 6 }}><Typography variant="h6" fontWeight="950" color="#ef4444" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}><AlertCircle /> JOB DISPUTED</Typography><Typography variant="body2" color="rgba(255,255,255,0.6)">You have rejected the resolution. Property Management is reviewing the case.</Typography><Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>YOUR DISPUTE REASON</Typography><Typography variant="body1" color="#FFF" sx={{ mt: 0.5 }}>{ticket.rejectionReason || ticket.feedback}</Typography></Box></Paper>}
                    {isClosed && <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 6, textAlign: 'center' }}><CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 16px' }} /><Typography variant="h6" fontWeight="950" color="#10b981">SERVICE FINALIZED</Typography><Typography variant="body2" color="rgba(255,255,255,0.4)" sx={{ mb: ticket.rating || ticket.feedback ? 2 : 0 }}>This ticket has been successfully closed and archived.</Typography>{ticket.rating && <Rating readOnly value={Number(ticket.rating)} sx={{ '& .MuiRating-iconFilled': { color: binThemeTokens.gold } }} />}{ticket.feedback && <Typography variant="body2" color="rgba(255,255,255,0.75)" sx={{ mt: 1, fontStyle: 'italic' }}>“{ticket.feedback}”</Typography>}</Paper>}
                </Grid>

                <Grid item xs={12} lg={4}><Box sx={{ mb: 3 }}><LiveTechnicianTrackingCard ticket={ticket} onChatClick={() => navigate(`/tenant/chat/${ticket.id}`)} onCallClick={() => { const phone = ticket.assignedTechnicianPhone || ticket.technicianPhone || ticket.tenantPhone; if (phone) window.open(`tel:${phone}`); }} showTimeline={true} /></Box><Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.02), border: '1px solid rgba(255,255,255,0.03)', borderRadius: 5 }}><Typography variant="subtitle2" fontWeight="950" color={binThemeTokens.gold} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}><Info size={16} /> NEED ASSISTANCE?</Typography><Typography variant="caption" color="rgba(255,255,255,0.4)" sx={{ fontWeight: 700, display: 'block', minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>Use the chat or call button above to reach your technician directly. For escalations, contact BIN GROUP concierge.</Typography></Paper></Grid>
            </Grid>
        </Box>
    );
}
