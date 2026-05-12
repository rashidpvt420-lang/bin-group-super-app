import React from 'react';
import {
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
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import {
    collection,
    db,
    functions,
    httpsCallable,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
} from '../../lib/firebase';

type PaymentRecord = {
    id: string;
    ownerName?: string;
    companyName?: string;
    ownerEmail?: string;
    status?: string;
    paymentMethod?: string;
    annualValue?: number;
    mobilizationAmount?: number;
    currency?: string;
    createdAt?: any;
};

const formatMoney = (value?: number, currency = 'AED') => {
    const amount = Number(value || 0);
    return `${currency} ${amount.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
};

export default function PaymentApprovalsPage() {
    const [rows, setRows] = React.useState<PaymentRecord[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const q = query(
            collection(db, 'payment_transactions'),
            where('status', 'in', ['pending', 'pending_admin_approval', 'submitted']),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setRows(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
                setLoading(false);
                setError(null);
            },
            (err) => {
                console.error('[ADMIN_PAYMENTS] stream failed', err);
                setLoading(false);
                setError(err?.message || 'Payment approvals stream failed.');
            }
        );

        return () => unsubscribe();
    }, []);

    const approvePayment = async (paymentId: string) => {
        setBusyId(paymentId);
        setError(null);
        try {
            const callable = httpsCallable(functions, 'adminApprovePayment');
            await callable({ paymentId });
        } catch (err: any) {
            console.error('[ADMIN_PAYMENTS] approval failed', err);
            setError(err?.message || 'Approval failed.');
        } finally {
            setBusyId(null);
        }
    };

    const rejectPayment = async (paymentId: string) => {
        setBusyId(paymentId);
        setError(null);
        try {
            const callable = httpsCallable(functions, 'adminRejectPayment');
            await callable({ paymentId, reason: 'Rejected from admin payment approval console.' });
        } catch (err: any) {
            console.error('[ADMIN_PAYMENTS] rejection failed', err);
            setError(err?.message || 'Rejection failed.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Box sx={{ p: 4, color: '#fff' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>
                        FINANCE COMMAND
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: -1 }}>
                        Payment Approvals
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>
                        Review owner mobilization submissions before dashboard activation.
                    </Typography>
                </Box>
                <Button
                    startIcon={<RefreshCw size={16} />}
                    onClick={() => window.location.reload()}
                    sx={{ color: '#DAA520', borderColor: 'rgba(218,165,32,0.35)' }}
                    variant="outlined"
                >
                    Refresh
                </Button>
            </Stack>

            {error && (
                <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fecaca' }}>
                    {error}
                </Paper>
            )}

            <Paper sx={{ bgcolor: 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                {loading ? (
                    <Box sx={{ p: 8, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress sx={{ color: '#DAA520' }} />
                    </Box>
                ) : rows.length === 0 ? (
                    <Box sx={{ p: 8, textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 900 }}>
                            No pending payment submissions
                        </Typography>
                        <Typography sx={{ color: 'rgba(255,255,255,0.55)', mt: 1 }}>
                            New owner mobilization payments will appear here in real time.
                        </Typography>
                    </Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Owner / Company</TableCell>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Email</TableCell>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Method</TableCell>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Annual Value</TableCell>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Mobilization</TableCell>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Status</TableCell>
                                    <TableCell align="right" sx={{ color: '#DAA520', fontWeight: 900 }}>Action</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((row) => (
                                    <TableRow key={row.id} sx={{ '& td': { borderColor: 'rgba(255,255,255,0.07)', color: '#fff' } }}>
                                        <TableCell>
                                            <Typography sx={{ fontWeight: 900 }}>{row.companyName || row.ownerName || 'Owner Submission'}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{row.id}</Typography>
                                        </TableCell>
                                        <TableCell>{row.ownerEmail || '—'}</TableCell>
                                        <TableCell>{row.paymentMethod || 'Manual'}</TableCell>
                                        <TableCell>{formatMoney(row.annualValue, row.currency)}</TableCell>
                                        <TableCell>{formatMoney(row.mobilizationAmount, row.currency)}</TableCell>
                                        <TableCell>
                                            <Chip label={row.status || 'pending'} size="small" sx={{ bgcolor: 'rgba(218,165,32,0.16)', color: '#DAA520', fontWeight: 900 }} />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" justifyContent="flex-end" gap={1}>
                                                <Button
                                                    size="small"
                                                    startIcon={<CheckCircle size={14} />}
                                                    disabled={busyId === row.id}
                                                    onClick={() => approvePayment(row.id)}
                                                    sx={{ bgcolor: '#16a34a', color: '#fff', fontWeight: 900, '&:hover': { bgcolor: '#15803d' } }}
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    size="small"
                                                    startIcon={<XCircle size={14} />}
                                                    disabled={busyId === row.id}
                                                    onClick={() => rejectPayment(row.id)}
                                                    sx={{ color: '#f87171', fontWeight: 900 }}
                                                >
                                                    Reject
                                                </Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>
        </Box>
    );
}
