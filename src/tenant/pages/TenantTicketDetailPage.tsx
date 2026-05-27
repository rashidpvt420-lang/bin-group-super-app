import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Stack, Chip, CircularProgress, 
    Button, Divider, TextField, Grid, alpha, Avatar,
    IconButton, ImageList, ImageListItem
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    MessageSquare, Check, X, ChevronLeft, Calendar, 
    Phone, AlertCircle, CheckCircle2, Info
} from 'lucide-react';
import { db, doc, onSnapshot, updateDoc, serverTimestamp, addDoc, collection } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { notifyTenantApproved, notifyTenantRejected } from '../../services/notificationService';
import LiveTechnicianTrackingCard from '../../components/tracking/LiveTechnicianTrackingCard';

export default function TenantTicketDetailPage() {
    const { id } = useParams();
    const { user } = useRole();
    const navigate = useNavigate();
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showRejectInput, setShowRejectInput] = useState(false);

    // Real-time listener so technicianLocation updates reflect instantly
    useEffect(() => {
        if (!id || !user?.uid) return;
        const unsub = onSnapshot(doc(db, 'maintenanceTickets', id), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.tenantId === user.uid || data.tenantUid === user.uid) {
                    setTicket({ id: snap.id, ...data });
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
    }, [id, user]);

    const handleApprove = async () => {
        if (!id || !user) return;
        setActionLoading(true);
        try {
            await updateDoc(doc(db, 'maintenanceTickets', id), {
                status: 'CLOSED',
                tenantApproved: true,
                closedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            await addDoc(collection(db, 'audit_logs'), {
                action: 'TENANT_APPROVED_COMPLETION',
                ticketId: id,
                actorId: user.uid,
                actorRole: 'tenant',
                timestamp: serverTimestamp()
            });
            setTicket((prev: any) => ({ ...prev, status: 'CLOSED', tenantApproved: true }));
            notifyTenantApproved(id, user.displayName || 'Tenant').catch(console.warn);
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!id || !user || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            await updateDoc(doc(db, 'maintenanceTickets', id), {
                status: 'DISPUTED',
                tenantApproved: false,
                rejectionReason: rejectReason,
                updatedAt: serverTimestamp()
            });
            await addDoc(collection(db, 'disputes'), {
                ticketId: id,
                tenantId: user.uid,
                reason: rejectReason,
                status: 'open',
                createdAt: serverTimestamp()
            });
            await addDoc(collection(db, 'audit_logs'), {
                action: 'TENANT_DISPUTED_COMPLETION',
                ticketId: id,
                actorId: user.uid,
                actorRole: 'tenant',
                reason: rejectReason,
                timestamp: serverTimestamp()
            });
            setTicket((prev: any) => ({ ...prev, status: 'DISPUTED', tenantApproved: false }));
            notifyTenantRejected(id, user.displayName || 'Tenant', rejectReason).catch(console.warn);
            setShowRejectInput(false);
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    if (!ticket) return null;

    const isCompleted = ticket.status === 'COMPLETED_PENDING_APPROVAL' || ticket.status === 'completed_pending_tenant_approval';
    const isDisputed = ticket.status === 'DISPUTED' || ticket.status === 'disputed';
    const isClosed = ticket.status === 'CLOSED';

    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', pb: 10 }}>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 4 }}>
                <IconButton onClick={() => navigate('/tenant/tickets')} sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    <ChevronLeft />
                </IconButton>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>TICKET RECORD</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', letterSpacing: -1 }}>#{ticket.id.substring(0,8)}</Typography>
                </Box>
            </Stack>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
                            <Box>
                                <Typography variant="h5" fontWeight="950" color="#FFF">{ticket.category}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                    <Calendar size={12} /> {ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : 'Just now'}
                                </Typography>
                            </Box>
                            <Chip 
                                label={ticket.status?.replace('_', ' ')} 
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.7rem' }} 
                            />
                        </Stack>

                        <Divider sx={{ mb: 4, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Stack spacing={3}>
                            <Box>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>SPECIFIC LOCATION</Typography>
                                <Typography variant="body1" color="#FFF" sx={{ mt: 0.5, fontWeight: 700 }}>{ticket.specificLocation || 'General Residence'}</Typography>
                            </Box>

                            <Box>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>DESCRIPTION</Typography>
                                <Typography variant="body1" color="rgba(255,255,255,0.8)" sx={{ mt: 1, lineHeight: 1.7 }}>{ticket.description}</Typography>
                            </Box>

                            {ticket.photos && ticket.photos.length > 0 && (
                                <Box>
                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, mb: 2, display: 'block' }}>SUBMITTED PHOTOS</Typography>
                                    <ImageList sx={{ width: '100%', borderRadius: 4, overflow: 'hidden' }} cols={3} gap={8}>
                                        {ticket.photos.map((url: string, index: number) => (
                                            <ImageListItem key={index}>
                                                <img src={url} alt={`issue-${index}`} loading="lazy" style={{ height: 150, objectFit: 'cover' }} />
                                            </ImageListItem>
                                        ))}
                                    </ImageList>
                                </Box>
                            )}
                        </Stack>
                    </Paper>

                    {isCompleted && (
                        <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid #10b981', borderRadius: 6 }}>
                            <Typography variant="h6" fontWeight="950" color="#10b981" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <CheckCircle2 /> WORK COMPLETED
                            </Typography>
                            <Typography variant="body2" color="rgba(255,255,255,0.6)" sx={{ mb: 4 }}>
                                Our technician has finalized the work. Please review and confirm resolution.
                            </Typography>
                            
                            {ticket.technicianNotes && (
                                <Box sx={{ mb: 4, p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>TECHNICIAN RESOLUTION NOTES</Typography>
                                    <Typography variant="body1" color="#FFF" sx={{ mt: 0.5 }}>{ticket.technicianNotes}</Typography>
                                </Box>
                            )}

                            {(ticket.beforePhotos || ticket.afterPhotos) && (
                                <Grid container spacing={2} sx={{ mb: 4 }}>
                                    <Grid item xs={6}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, mb: 1, display: 'block' }}>BEFORE</Typography>
                                        <Box sx={{ borderRadius: 3, overflow: 'hidden', pt: '75%', position: 'relative', bgcolor: 'rgba(0,0,0,0.3)' }}>
                                            {ticket.beforePhotos?.[0] ? <img src={ticket.beforePhotos[0]} alt="Before maintenance" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <Info style={{ position: 'absolute', top: '40%', left: '40%', opacity: 0.2 }} />}
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, mb: 1, display: 'block' }}>AFTER</Typography>
                                        <Box sx={{ borderRadius: 3, overflow: 'hidden', pt: '75%', position: 'relative', bgcolor: 'rgba(0,0,0,0.3)' }}>
                                            {ticket.afterPhotos?.[0] ? <img src={ticket.afterPhotos[0]} alt="After maintenance" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <Info style={{ position: 'absolute', top: '40%', left: '40%', opacity: 0.2 }} />}
                                        </Box>
                                    </Grid>
                                </Grid>
                            )}

                            {!showRejectInput ? (
                                <Stack direction="row" spacing={2}>
                                    <Button fullWidth variant="contained" color="success" startIcon={<Check />} onClick={handleApprove} disabled={actionLoading} sx={{ fontWeight: 950, py: 1.5, borderRadius: 3 }}>
                                        APPROVE COMPLETION
                                    </Button>
                                    <Button fullWidth variant="outlined" color="error" startIcon={<X />} onClick={() => setShowRejectInput(true)} disabled={actionLoading} sx={{ fontWeight: 950, py: 1.5, borderRadius: 3 }}>
                                        DISPUTE
                                    </Button>
                                </Stack>
                            ) : (
                                <Stack spacing={2}>
                                    <TextField fullWidth multiline rows={3} label="Reason for Disputing Resolution" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' } }} />
                                    <Stack direction="row" spacing={2}>
                                        <Button fullWidth variant="contained" color="error" onClick={handleReject} disabled={actionLoading || !rejectReason.trim()} sx={{ fontWeight: 950, borderRadius: 3 }}>
                                            CONFIRM DISPUTE
                                        </Button>
                                        <Button fullWidth variant="text" onClick={() => setShowRejectInput(false)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>
                                            CANCEL
                                        </Button>
                                    </Stack>
                                </Stack>
                            )}
                        </Paper>
                    )}

                    {isDisputed && (
                        <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#ef4444', 0.05), border: '1px solid #ef4444', borderRadius: 6 }}>
                            <Typography variant="h6" fontWeight="950" color="#ef4444" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <AlertCircle /> JOB DISPUTED
                            </Typography>
                            <Typography variant="body2" color="rgba(255,255,255,0.6)">
                                You have rejected the resolution. Property Management is reviewing the case.
                            </Typography>
                            <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>YOUR DISPUTE REASON</Typography>
                                <Typography variant="body1" color="#FFF" sx={{ mt: 0.5 }}>{ticket.rejectionReason}</Typography>
                            </Box>
                        </Paper>
                    )}

                    {isClosed && (
                        <Paper sx={{ p: 4, mb: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 6, textAlign: 'center' }}>
                            <CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 16px' }} />
                            <Typography variant="h6" fontWeight="950" color="#10b981">SERVICE FINALIZED</Typography>
                            <Typography variant="body2" color="rgba(255,255,255,0.4)">This ticket has been successfully closed and archived.</Typography>
                        </Paper>
                    )}
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Box sx={{ mb: 3 }}>
                        <LiveTechnicianTrackingCard
                            ticket={ticket}
                            onChatClick={() => navigate(`/tenant/chat/${ticket.id}`)}
                            onCallClick={() => {
                                const phone = ticket.assignedTechnicianPhone || ticket.tenantPhone;
                                if (phone) window.open(`tel:${phone}`);
                            }}
                            showTimeline={true}
                        />
                    </Box>

                    <Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.02), border: '1px solid rgba(255,255,255,0.03)', borderRadius: 5 }}>
                        <Typography variant="subtitle2" fontWeight="950" color={binThemeTokens.gold} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Info size={16} /> NEED ASSISTANCE?
                        </Typography>
                        <Typography variant="caption" color="rgba(255,255,255,0.4)" sx={{ fontWeight: 700, display: 'block', minWidth: 0, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            Use the chat or call button above to reach your technician directly.
                            For escalations, contact BIN GROUP concierge.
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}
