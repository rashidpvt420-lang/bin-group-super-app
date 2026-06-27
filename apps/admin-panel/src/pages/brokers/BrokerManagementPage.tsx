import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Grid,
    IconButton,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
    alpha
} from '@mui/material';
import {
    AccountBalance as BankIcon,
    Badge as BadgeIcon,
    Cancel as CancelIcon,
    CheckCircle as CheckCircleIcon,
    People as PeopleIcon,
    TrendingUp as TrendingUpIcon,
    Visibility as VisibilityIcon
} from '@mui/icons-material';
import { Clock, FileCheck2, WalletCards } from 'lucide-react';
import { collection, db, functions, httpsCallable, limit, onSnapshot, orderBy, query, where } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

type Broker = {
    id: string;
    displayName?: string;
    email?: string;
    phoneNumber?: string;
    brokerCode?: string;
    affiliateCode?: string;
    role?: string;
    status?: string;
    approvalStatus?: string;
    kycStatus?: string;
    brokerKycStatus?: string;
    reraLicense?: string;
    reraStatus?: string;
    reraVerified?: boolean;
    companyName?: string;
    tradeLicenseNumber?: string;
    emiratesIdNumber?: string;
    passportNumber?: string;
    bankName?: string;
    bankAccountHolder?: string;
    bankIban?: string;
    iban?: string;
    brokerTerritory?: string;
    commissionAgreementAccepted?: boolean;
    brokerProfileCompletion?: number;
    profileCompletionScore?: number;
    brokerKycReviewReason?: string;
    rejectionReason?: string;
    updatedAt?: any;
};

type BrokerDocument = {
    id: string;
    brokerId?: string;
    title?: string;
    documentType?: string;
    fileName?: string;
    url?: string;
    downloadUrl?: string;
    status?: string;
};

type PayoutRequest = {
    id: string;
    brokerId?: string;
    brokerName?: string;
    brokerEmail?: string;
    brokerCode?: string;
    amount?: number;
    currency?: string;
    commissionCount?: number;
    commissionIds?: string[];
    status?: string;
    approvalStatus?: string;
    paymentStatus?: string;
    bankName?: string;
    bankIban?: string;
    notes?: string;
    reviewReason?: string;
    createdAt?: any;
    requestedAt?: any;
    updatedAt?: any;
};

const statusText = (value?: string) => String(value || 'PENDING').replaceAll('_', ' ').toUpperCase();

function chipColor(status?: string) {
    const normalized = statusText(status);
    if (['APPROVED', 'VERIFIED', 'PAID'].includes(normalized)) return 'success';
    if (['REJECTED', 'BLOCKED'].includes(normalized)) return 'error';
    if (normalized.includes('PENDING') || normalized.includes('REQUESTED')) return 'warning';
    return 'default';
}

function dateLabel(value: any) {
    if (!value) return 'Not recorded';
    try {
        const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
        return Number.isNaN(date.getTime()) ? 'Recorded' : date.toLocaleString();
    } catch {
        return 'Recorded';
    }
}

function brokerNeedsReview(broker: Broker) {
    const status = statusText(broker.status || broker.approvalStatus);
    const kyc = statusText(broker.brokerKycStatus || broker.kycStatus || broker.reraStatus);
    return !['APPROVED', 'VERIFIED'].includes(status) || ['PENDING REVIEW', 'PENDING', 'INCOMPLETE'].includes(kyc);
}

function missingKycItems(broker: Broker) {
    return [
        { label: 'RERA license', missing: !broker.reraLicense },
        { label: 'ID / passport / trade license', missing: !broker.tradeLicenseNumber && !broker.emiratesIdNumber && !broker.passportNumber },
        { label: 'Bank name', missing: !broker.bankName },
        { label: 'IBAN', missing: !broker.bankIban && !broker.iban },
        { label: 'Commission agreement', missing: broker.commissionAgreementAccepted !== true },
    ].filter((item) => item.missing).map((item) => item.label);
}

export default function BrokerManagementPage() {
    const { isRTL } = useLanguage();
    const [brokers, setBrokers] = useState<Broker[]>([]);
    const [documents, setDocuments] = useState<Record<string, BrokerDocument[]>>({});
    const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
    const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null);
    const [reviewBroker, setReviewBroker] = useState<Broker | null>(null);
    const [reviewDecision, setReviewDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
    const [reviewReason, setReviewReason] = useState('');
    const [busy, setBusy] = useState('');
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const brokerQuery = query(collection(db, 'users'), where('role', 'in', ['broker', 'BROKER']));
        const unsubscribe = onSnapshot(brokerQuery, (snapshot) => {
            const fetched = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Broker[];
            setBrokers(fetched.sort((a, b) => statusText(a.status).localeCompare(statusText(b.status))));
            setLoading(false);
        }, (error) => {
            console.error('[BROKER_ADMIN] broker listener failed', error);
            setNotice(error?.message || 'Broker profiles could not be loaded.');
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'brokerDocuments'), (snapshot) => {
            const grouped: Record<string, BrokerDocument[]> = {};
            snapshot.docs.forEach((docSnap) => {
                const item = { id: docSnap.id, ...docSnap.data() } as BrokerDocument;
                const brokerId = item.brokerId || 'unassigned';
                grouped[brokerId] = [...(grouped[brokerId] || []), item];
            });
            setDocuments(grouped);
        }, (error) => console.warn('[BROKER_ADMIN] broker documents listener failed', error));
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const payoutQuery = query(collection(db, 'broker_payout_requests'), orderBy('createdAt', 'desc'), limit(100));
        const unsubscribe = onSnapshot(payoutQuery, (snapshot) => {
            setPayoutRequests(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as PayoutRequest[]);
        }, (error) => console.warn('[BROKER_ADMIN] payout request listener failed', error));
        return () => unsubscribe();
    }, []);

    const stats = useMemo(() => ({
        total: brokers.length,
        pending: brokers.filter(brokerNeedsReview).length,
        approved: brokers.filter((broker) => statusText(broker.status || broker.approvalStatus) === 'APPROVED').length,
        payoutPending: payoutRequests.filter((request) => statusText(request.status).includes('PENDING')).length,
    }), [brokers, payoutRequests]);

    const selectedDocuments = selectedBroker ? documents[selectedBroker.id] || [] : [];
    const selectedMissing = selectedBroker ? missingKycItems(selectedBroker) : [];

    const openReview = (broker: Broker, decision: 'APPROVE' | 'REJECT') => {
        setReviewBroker(broker);
        setReviewDecision(decision);
        setReviewReason('');
        setNotice('');
    };

    const submitKycReview = async () => {
        if (!reviewBroker) return;
        if (reviewDecision === 'REJECT' && !reviewReason.trim()) {
            setNotice('A rejection reason is required.');
            return;
        }
        setBusy(`kyc-${reviewBroker.id}`);
        try {
            const callable = httpsCallable(functions, 'adminReviewBrokerKyc');
            const result = await callable({ brokerId: reviewBroker.id, decision: reviewDecision, reason: reviewReason.trim() });
            const data = result.data as any;
            setNotice(`Broker KYC ${reviewDecision.toLowerCase()} saved. Released commissions: ${data?.releasedCommissions || 0}.`);
            setReviewBroker(null);
            setSelectedBroker(null);
        } catch (error: any) {
            setNotice(error?.message || 'Broker KYC review failed.');
        } finally {
            setBusy('');
        }
    };

    const reviewPayout = async (request: PayoutRequest, action: 'APPROVE' | 'REJECT' | 'MARK_PAID') => {
        const reason = action === 'REJECT'
            ? window.prompt('Reason for rejecting this payout request?') || ''
            : action === 'MARK_PAID'
                ? window.prompt('Payment reference or notes for paid payout?', '') || ''
                : '';
        if (action === 'REJECT' && !reason.trim()) return;
        setBusy(`payout-${request.id}`);
        try {
            const callable = httpsCallable(functions, 'adminReviewBrokerPayoutRequest');
            await callable({
                requestId: request.id,
                action,
                reason: reason.trim(),
                paymentReference: action === 'MARK_PAID' ? reason.trim() : '',
            });
            setNotice(`Payout request ${action.replace('_', ' ').toLowerCase()} saved.`);
        } catch (error: any) {
            setNotice(error?.message || 'Payout request review failed.');
        } finally {
            setBusy('');
        }
    };

    if (loading) {
        return <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
    }

    return (
        <Box sx={{ p: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 4 }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: '#C9A646', fontWeight: 950, letterSpacing: 3 }}>BROKER CONTROL</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 950 }}>Broker KYC & Payout Review</Typography>
                    <Typography color="text.secondary">Admin-only broker approval, rejection, documents, and payout request workflow.</Typography>
                </Box>
                <Chip icon={<FileCheck2 size={16} />} label="ADMIN REVIEW REQUIRED" color="warning" sx={{ fontWeight: 950 }} />
            </Stack>

            {notice && <Alert severity={notice.includes('failed') || notice.includes('required') ? 'warning' : 'success'} onClose={() => setNotice('')} sx={{ mb: 3 }}>{notice}</Alert>}

            <Grid container spacing={3} sx={{ mb: 4 }}>
                {[
                    { label: 'Total Brokers', value: stats.total, color: 'primary.main', icon: <PeopleIcon /> },
                    { label: 'KYC Needs Review', value: stats.pending, color: 'warning.main', icon: <TrendingUpIcon /> },
                    { label: 'Approved Partners', value: stats.approved, color: 'success.main', icon: <CheckCircleIcon /> },
                    { label: 'Payout Requests', value: stats.payoutPending, color: 'secondary.main', icon: <WalletCards size={22} /> },
                ].map((stat) => (
                    <Grid item xs={12} md={3} key={stat.label}>
                        <Card sx={{ bgcolor: '#fff', borderRadius: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                            <CardContent>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                                    <Avatar sx={{ bgcolor: stat.color }}>{stat.icon}</Avatar>
                                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>{stat.label}</Typography>
                                        <Typography variant="h4" sx={{ fontWeight: 950 }}>{stat.value}</Typography>
                                    </Box>
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Grid container spacing={3}>
                <Grid item xs={12} lg={7}>
                    <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
                        <Table>
                            <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>Broker</TableCell>
                                    <TableCell sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>KYC</TableCell>
                                    <TableCell sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>Documents</TableCell>
                                    <TableCell sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>Payout Setup</TableCell>
                                    <TableCell sx={{ fontWeight: 900 }} align={isRTL ? 'left' : 'right'}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {brokers.map((broker) => {
                                    const missing = missingKycItems(broker);
                                    const brokerDocs = documents[broker.id] || [];
                                    return (
                                        <TableRow key={broker.id} hover>
                                            <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                                <Typography sx={{ fontWeight: 900 }}>{broker.displayName || broker.email || 'Broker'}</Typography>
                                                <Typography variant="caption" color="text.secondary">{broker.email || broker.id}</Typography>
                                                <Box sx={{ mt: 1 }}><Chip label={broker.brokerCode || broker.affiliateCode || `BIN-${broker.id.slice(0, 6).toUpperCase()}`} size="small" sx={{ fontWeight: 800 }} /></Box>
                                            </TableCell>
                                            <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                                <Stack spacing={0.8}>
                                                    <Chip label={statusText(broker.brokerKycStatus || broker.kycStatus || broker.status)} color={chipColor(broker.brokerKycStatus || broker.kycStatus || broker.status) as any} size="small" sx={{ fontWeight: 900, width: 'fit-content' }} />
                                                    <Typography variant="caption" color={missing.length ? 'error' : 'success.main'}>{missing.length ? `Missing: ${missing.join(', ')}` : 'KYC dossier complete'}</Typography>
                                                </Stack>
                                            </TableCell>
                                            <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                                <Typography sx={{ fontWeight: 900 }}>{brokerDocs.length}</Typography>
                                                <Typography variant="caption" color="text.secondary">uploaded evidence</Typography>
                                            </TableCell>
                                            <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                                <Chip size="small" label={broker.bankName && (broker.bankIban || broker.iban) ? 'BANK READY' : 'BANK MISSING'} color={broker.bankName && (broker.bankIban || broker.iban) ? 'success' : 'warning'} sx={{ fontWeight: 900 }} />
                                                <Typography variant="caption" display="block" color={broker.commissionAgreementAccepted ? 'success.main' : 'warning.main'}>{broker.commissionAgreementAccepted ? 'Terms accepted' : 'Terms missing'}</Typography>
                                            </TableCell>
                                            <TableCell align={isRTL ? 'left' : 'right'}>
                                                <Tooltip title="View KYC dossier"><IconButton onClick={() => setSelectedBroker(broker)}><VisibilityIcon /></IconButton></Tooltip>
                                                <Tooltip title="Approve KYC"><span><IconButton disabled={busy === `kyc-${broker.id}`} color="success" onClick={() => openReview(broker, 'APPROVE')}><CheckCircleIcon /></IconButton></span></Tooltip>
                                                <Tooltip title="Reject KYC"><span><IconButton disabled={busy === `kyc-${broker.id}`} color="error" onClick={() => openReview(broker, 'REJECT')}><CancelIcon /></IconButton></span></Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {brokers.length === 0 && (
                                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 8 }}>No broker profiles found.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>

                <Grid item xs={12} lg={5}>
                    <Paper sx={{ p: 3, borderRadius: 2, bgcolor: '#fff', border: '1px solid #e2e8f0' }}>
                        <Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 2 }}>
                            <WalletCards size={20} color="#C9A646" />
                            <Typography variant="h6" sx={{ fontWeight: 950 }}>Broker Payout Requests</Typography>
                        </Stack>
                        <Stack spacing={2}>
                            {payoutRequests.map((request) => {
                                const status = statusText(request.status);
                                return (
                                    <Box key={request.id} sx={{ p: 2, borderRadius: 2, border: '1px solid #e5e7eb', bgcolor: alpha('#C9A646', 0.03) }}>
                                        <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
                                            <Box>
                                                <Typography sx={{ fontWeight: 950 }}>{request.brokerName || request.brokerEmail || 'Broker'}</Typography>
                                                <Typography variant="caption" color="text.secondary">AED {Number(request.amount || 0).toLocaleString()} · {request.commissionCount || request.commissionIds?.length || 0} commission(s)</Typography>
                                                <Typography variant="caption" display="block" color="text.secondary"><Clock size={12} /> {dateLabel(request.requestedAt || request.createdAt)}</Typography>
                                            </Box>
                                            <Chip size="small" label={status} color={chipColor(status) as any} sx={{ fontWeight: 900 }} />
                                        </Stack>
                                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Bank: {request.bankName || 'Missing'} · IBAN: {request.bankIban || 'Missing'}</Typography>
                                        {request.notes && <Typography variant="body2" sx={{ mt: 1 }}>{request.notes}</Typography>}
                                        {request.reviewReason && <Alert severity="info" sx={{ mt: 1 }}>{request.reviewReason}</Alert>}
                                        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                                            {status.includes('PENDING') && (
                                                <>
                                                    <Button size="small" disabled={busy === `payout-${request.id}`} onClick={() => reviewPayout(request, 'APPROVE')} variant="contained" color="success">Approve</Button>
                                                    <Button size="small" disabled={busy === `payout-${request.id}`} onClick={() => reviewPayout(request, 'REJECT')} color="error">Reject</Button>
                                                </>
                                            )}
                                            {['APPROVED'].includes(status) && (
                                                <Button size="small" disabled={busy === `payout-${request.id}`} onClick={() => reviewPayout(request, 'MARK_PAID')} variant="contained">Mark paid</Button>
                                            )}
                                        </Stack>
                                    </Box>
                                );
                            })}
                            {payoutRequests.length === 0 && <Alert severity="info">No broker payout requests have been submitted yet.</Alert>}
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>

            <Dialog open={Boolean(selectedBroker)} onClose={() => setSelectedBroker(null)} maxWidth="md" fullWidth dir={isRTL ? 'rtl' : 'ltr'}>
                <DialogTitle sx={{ fontWeight: 950 }}>Broker KYC Dossier</DialogTitle>
                <DialogContent dividers>
                    {selectedBroker && (
                        <Stack spacing={3}>
                            <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={2}>
                                <Box>
                                    <Typography variant="h5" sx={{ fontWeight: 950 }}>{selectedBroker.displayName || selectedBroker.email}</Typography>
                                    <Typography color="text.secondary">{selectedBroker.companyName || 'Brokerage company not provided'} · {selectedBroker.brokerTerritory || 'Territory missing'}</Typography>
                                </Box>
                                <Chip label={statusText(selectedBroker.brokerKycStatus || selectedBroker.kycStatus || selectedBroker.status)} color={chipColor(selectedBroker.brokerKycStatus || selectedBroker.kycStatus || selectedBroker.status) as any} sx={{ fontWeight: 950, alignSelf: 'flex-start' }} />
                            </Stack>
                            {selectedMissing.length > 0 && <Alert severity="warning">Missing before approval: {selectedMissing.join(', ')}</Alert>}
                            <Grid container spacing={3}>
                                <Grid item xs={12} md={6}>
                                    <Paper sx={{ p: 2, bgcolor: '#f8fafc', border: '1px solid #e5e7eb' }}>
                                        <Typography variant="overline" sx={{ fontWeight: 950 }}>Identity</Typography>
                                        <Typography sx={{ fontWeight: 900 }}>RERA: {selectedBroker.reraLicense || 'Not provided'}</Typography>
                                        <Typography variant="body2">Trade license: {selectedBroker.tradeLicenseNumber || 'Not provided'}</Typography>
                                        <Typography variant="body2">Emirates ID: {selectedBroker.emiratesIdNumber || 'Not provided'}</Typography>
                                        <Typography variant="body2">Passport: {selectedBroker.passportNumber || 'Not provided'}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Paper sx={{ p: 2, bgcolor: '#f8fafc', border: '1px solid #e5e7eb' }}>
                                        <Typography variant="overline" sx={{ fontWeight: 950 }}>Settlement</Typography>
                                        <Stack direction="row" spacing={1.5} alignItems="center"><BankIcon fontSize="small" /><Typography sx={{ fontWeight: 900 }}>{selectedBroker.bankName || 'Bank missing'}</Typography></Stack>
                                        <Stack direction="row" spacing={1.5} alignItems="center"><BadgeIcon fontSize="small" /><Typography>{selectedBroker.bankIban || selectedBroker.iban || 'IBAN missing'}</Typography></Stack>
                                        <Typography variant="body2" color={selectedBroker.commissionAgreementAccepted ? 'success.main' : 'warning.main'}>{selectedBroker.commissionAgreementAccepted ? 'Commission agreement accepted' : 'Commission agreement not accepted'}</Typography>
                                    </Paper>
                                </Grid>
                            </Grid>
                            <Divider />
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 950, mb: 1 }}>Uploaded Broker Documents</Typography>
                                <Stack spacing={1}>
                                    {selectedDocuments.map((docItem) => {
                                        const href = docItem.url || docItem.downloadUrl || '';
                                        return (
                                            <Stack key={docItem.id} direction="row" justifyContent="space-between" spacing={2} sx={{ p: 1.5, border: '1px solid #e5e7eb', borderRadius: 2 }}>
                                                <Box>
                                                    <Typography sx={{ fontWeight: 900 }}>{docItem.title || docItem.documentType || docItem.fileName || 'Broker document'}</Typography>
                                                    <Typography variant="caption" color="text.secondary">{statusText(docItem.status)}</Typography>
                                                </Box>
                                                {href && <Button href={href} target="_blank" rel="noreferrer" startIcon={<VisibilityIcon />}>Open</Button>}
                                            </Stack>
                                        );
                                    })}
                                    {selectedDocuments.length === 0 && <Alert severity="info">No broker document records were found for this profile.</Alert>}
                                </Stack>
                            </Box>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setSelectedBroker(null)}>Close</Button>
                    {selectedBroker && <Button color="error" onClick={() => openReview(selectedBroker, 'REJECT')}>Reject</Button>}
                    {selectedBroker && <Button variant="contained" color="success" onClick={() => openReview(selectedBroker, 'APPROVE')}>Approve KYC</Button>}
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(reviewBroker)} onClose={() => setReviewBroker(null)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 950 }}>{reviewDecision === 'APPROVE' ? 'Approve broker KYC' : 'Reject broker KYC'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Typography>{reviewBroker?.displayName || reviewBroker?.email}</Typography>
                        {reviewBroker && missingKycItems(reviewBroker).length > 0 && reviewDecision === 'APPROVE' && (
                            <Alert severity="warning">Approval may fail until missing fields are fixed: {missingKycItems(reviewBroker).join(', ')}</Alert>
                        )}
                        <TextField
                            label={reviewDecision === 'REJECT' ? 'Rejection reason' : 'Review note'}
                            value={reviewReason}
                            onChange={(event) => setReviewReason(event.target.value)}
                            multiline
                            minRows={3}
                            required={reviewDecision === 'REJECT'}
                            fullWidth
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setReviewBroker(null)}>Cancel</Button>
                    <Button disabled={Boolean(reviewBroker && busy === `kyc-${reviewBroker.id}`)} onClick={submitKycReview} variant="contained" color={reviewDecision === 'APPROVE' ? 'success' : 'error'}>
                        {busy ? 'Saving...' : reviewDecision === 'APPROVE' ? 'Approve' : 'Reject'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
