import React, { useState, useEffect, useRef } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import {
    CheckCircle as AcceptTenantIcon,
    Construction as TechIcon,
    Refresh as ReinspectIcon,
} from '@mui/icons-material';
import { collection, onSnapshot, query, where, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { useAuth } from '../../context/AuthContext';

type DisputedTicket = {
    id: string;
    title?: string;
    description?: string;
    tenantName?: string;
    tenantId?: string;
    technicianName?: string;
    technicianId?: string;
    propertyName?: string;
    propertyId?: string;
    disputeReason?: string;
    createdAt?: any;
    status?: string;
};

type ActionBusy = { id: string; action: string } | null;

export default function DisputeQueuePage() {
    const { t, isRTL } = useLanguage();
    const { user } = useAuth();
    const [tickets, setTickets] = useState<DisputedTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionBusy, setActionBusy] = useState<ActionBusy>(null);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const unsubRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        const q = query(
            collection(db, 'maintenanceTickets'),
            where('status', '==', 'DISPUTED')
        );
        unsubRef.current = onSnapshot(
            q,
            (snap) => {
                const rows = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() } as DisputedTicket))
                    .sort((a, b) => {
                        const aTime = a.createdAt?.seconds ?? 0;
                        const bTime = b.createdAt?.seconds ?? 0;
                        return bTime - aTime;
                    });
                setTickets(rows);
                setLoading(false);
            },
            (err) => {
                console.error('[DisputeQueue] listener error:', err);
                setLoading(false);
            }
        );
        return () => { unsubRef.current?.(); };
    }, []);

    const resolveDispute = async (ticket: DisputedTicket, newStatus: string, actionLabel: string) => {
        setActionBusy({ id: ticket.id, action: newStatus });
        setNotice(null);
        try {
            await updateDoc(doc(db, 'maintenanceTickets', ticket.id), {
                status: newStatus,
                disputeResolvedBy: user?.uid || 'admin',
                disputeResolvedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            await addDoc(collection(db, 'auditLogs'), {
                action: `ADMIN_DISPUTE_${newStatus}`,
                ticketId: ticket.id,
                actorId: user?.uid || 'admin',
                resolution: newStatus,
                createdAt: serverTimestamp(),
            });
            setNotice({ type: 'success', text: t('ops.dispute.resolved_success') });
        } catch (err: any) {
            console.error('[DisputeQueue] resolve error:', err);
            setNotice({ type: 'error', text: err?.message || t('ops.dispute.resolve_failed') });
        } finally {
            setActionBusy(null);
        }
    };

    const formatDate = (ts: any) => {
        if (!ts) return '—';
        const d = ts?.toDate ? ts.toDate() : new Date(ts);
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(isRTL ? 'ar-AE' : 'en-AE', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const isBusy = (id: string) => actionBusy?.id === id;

    return (
        <Box sx={{ p: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="overline" sx={{ color: '#ef4444', fontWeight: 900, letterSpacing: 3 }}>
                    {t('ops.dispute.overline')}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5 }}>
                    {t('ops.dispute.page_title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {t('ops.dispute.page_subtitle')}
                </Typography>
            </Box>

            {notice && (
                <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>
                    {notice.text}
                </Alert>
            )}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : tickets.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                    <Typography color="text.secondary" fontWeight={700}>{t('ops.dispute.empty_state')}</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ borderRadius: 4, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                    <Table>
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.dispute.col_ticket_id')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.dispute.col_description')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.dispute.col_tenant')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.dispute.col_technician')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.dispute.col_property')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.dispute.col_dispute_reason')}</TableCell>
                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{t('ops.dispute.col_submitted')}</TableCell>
                                <TableCell sx={{ fontWeight: 800 }} align={isRTL ? 'left' : 'right'}>{t('common.actions')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {tickets.map((ticket) => (
                                <TableRow key={ticket.id} hover>
                                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Chip label={ticket.id.substring(0, 8).toUpperCase()} size="small" sx={{ fontWeight: 800, fontFamily: 'monospace', bgcolor: '#fef3c7', color: '#92400e' }} />
                                    </TableCell>
                                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', maxWidth: 200 }}>
                                        <Typography variant="body2" fontWeight={700} noWrap>{ticket.title || ticket.description || '—'}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="body2">{ticket.tenantName || ticket.tenantId || '—'}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="body2">{ticket.technicianName || ticket.technicianId || '—'}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="body2">{ticket.propertyName || ticket.propertyId || '—'}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', maxWidth: 180 }}>
                                        <Typography variant="caption" color="error">{ticket.disputeReason || '—'}</Typography>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="caption" color="text.secondary">{formatDate(ticket.createdAt)}</Typography>
                                    </TableCell>
                                    <TableCell align={isRTL ? 'left' : 'right'}>
                                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap" justifyContent={isRTL ? 'flex-start' : 'flex-end'}>
                                            <Button
                                                size="small"
                                                variant="contained"
                                                color="success"
                                                startIcon={isBusy(ticket.id) && actionBusy?.action === 'RESOLVED_TENANT_WIN' ? <CircularProgress size={14} color="inherit" /> : <AcceptTenantIcon fontSize="small" />}
                                                disabled={isBusy(ticket.id)}
                                                onClick={() => resolveDispute(ticket, 'RESOLVED_TENANT_WIN', 'tenant_win')}
                                                sx={{ fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                                            >
                                                {t('ops.dispute.action_tenant_win')}
                                            </Button>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                color="warning"
                                                startIcon={isBusy(ticket.id) && actionBusy?.action === 'RESOLVED_TECH_WIN' ? <CircularProgress size={14} color="inherit" /> : <TechIcon fontSize="small" />}
                                                disabled={isBusy(ticket.id)}
                                                onClick={() => resolveDispute(ticket, 'RESOLVED_TECH_WIN', 'tech_win')}
                                                sx={{ fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                                            >
                                                {t('ops.dispute.action_tech_win')}
                                            </Button>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                color="info"
                                                startIcon={isBusy(ticket.id) && actionBusy?.action === 'REINSPECTION_REQUESTED' ? <CircularProgress size={14} color="inherit" /> : <ReinspectIcon fontSize="small" />}
                                                disabled={isBusy(ticket.id)}
                                                onClick={() => resolveDispute(ticket, 'REINSPECTION_REQUESTED', 'reinspect')}
                                                sx={{ fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                                            >
                                                {t('ops.dispute.action_reinspect')}
                                            </Button>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}
