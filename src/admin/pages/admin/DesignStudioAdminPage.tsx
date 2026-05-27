import React, { useState, useEffect } from 'react';
import {
    Box,
    Grid,
    Paper,
    Button,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    alpha,
    IconButton,
    Stack,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
} from '@mui/material';
import {
    Eye,
    CheckCircle,
    XCircle,
    ClipboardList,
    CreditCard,
    Hammer,
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

interface DesignRequest {
    id: string;
    userName?: string;
    ownerName?: string;
    role?: string;
    propertyName?: string;
    propertyLocation?: string;
    roomType?: string;
    theme?: string;
    budget?: number;
    scope?: any;
    designStyle?: string;
    quote?: any;
    status: string;
    approvalStatus?: string;
    quoteStatus?: string;
    paymentStatus?: string;
    workflowStage?: string;
    adminHandoffStatus?: string;
    engineerHandoffStatus?: string;
    createdAt: any;
    originalImage?: string;
}

function statusTone(status?: string) {
    const value = String(status || '').toUpperCase();
    if (['READY_FOR_EXECUTION', 'APPROVED_FOR_EXECUTION', 'PAID', 'ENGINEER_REVIEW', 'WORK_ORDER_READY'].includes(value)) return '#10b981';
    if (['PAYMENT_PENDING', 'PENDING_ADMIN_PAYMENT_VERIFICATION', 'OWNER_APPROVED_TENANT_TO_PAY', 'OWNER_APPROVED_OWNER_TO_PAY'].includes(value)) return '#f59e0b';
    if (['REJECTED', 'OWNER_REJECTED'].includes(value)) return '#ef4444';
    return binThemeTokens.gold;
}

export default function DesignStudioAdminPage() {
    const { t } = useLanguage();
    const [requests, setRequests] = useState<DesignRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState<DesignRequest | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'design_requests'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
            })) as DesignRequest[];
            setRequests(fetched);
            setLoading(false);
        }, (error) => {
            console.error('Design Requests Error:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleWorkflowAction = async (requestId: string, action: 'ADMIN_APPROVE_EXECUTION' | 'ADMIN_REJECT' | 'MARK_PAYMENT_PENDING' | 'ENGINEER_REVIEW') => {
        setProcessing(true);
        try {
            const updates: Record<string, any> = {
                updatedAt: serverTimestamp(),
                adminActionAt: serverTimestamp(),
                adminAction: action,
            };

            if (action === 'ADMIN_APPROVE_EXECUTION') {
                Object.assign(updates, {
                    status: 'READY_FOR_EXECUTION',
                    workflowStage: 'READY_FOR_EXECUTION',
                    approvalStatus: 'APPROVED_FOR_EXECUTION',
                    adminHandoffStatus: 'APPROVED_FOR_EXECUTION',
                    engineerHandoffStatus: 'READY_FOR_SCOPE_REVIEW',
                    quoteStatus: 'APPROVED_FOR_EXECUTION',
                });
            }

            if (action === 'MARK_PAYMENT_PENDING') {
                Object.assign(updates, {
                    status: 'PAYMENT_PENDING',
                    workflowStage: 'PAYMENT_PENDING',
                    paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
                    adminHandoffStatus: 'PAYMENT_QUEUE',
                    engineerHandoffStatus: 'WAITING_PAYMENT',
                });
            }

            if (action === 'ENGINEER_REVIEW') {
                Object.assign(updates, {
                    status: 'ENGINEER_REVIEW',
                    workflowStage: 'ENGINEER_REVIEW',
                    adminHandoffStatus: 'ENGINEER_REVIEW',
                    engineerHandoffStatus: 'READY_FOR_SCOPE_REVIEW',
                });
            }

            if (action === 'ADMIN_REJECT') {
                Object.assign(updates, {
                    status: 'REJECTED',
                    workflowStage: 'REJECTED',
                    approvalStatus: 'ADMIN_REJECTED',
                    quoteStatus: 'REJECTED',
                    adminHandoffStatus: 'REJECTED',
                    engineerHandoffStatus: 'BLOCKED',
                });
            }

            await updateDoc(doc(db, 'design_requests', requestId), updates);
            setIsDetailsOpen(false);
        } catch (err) {
            console.error(err);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <AdminPageFrame
            title={t('design.manager_title') || 'DESIGN STUDIO MANAGER'}
            subtitle={t('design.manager_subtitle') || 'Review and manage AI-generated design requests'}
            loading={loading}
            isEmpty={requests.length === 0}
            emptyMessage={t('design.empty') || 'No design requests yet.'}
            breadcrumbs={[{ label: 'Design Studio' }]}
        >
            <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>CLIENT</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>PROPERTY</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>TYPE</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>QUOTE</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>WORKFLOW</TableCell>
                            <TableCell align="right" sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTIONS</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {requests.map((req) => {
                            const color = statusTone(req.status);
                            return (
                                <TableRow key={req.id} hover>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>{req.userName || req.ownerName || 'UNSPECIFIED USER'}</Typography>
                                        <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center' }}>
                                            <Chip label={String(req.role || 'UNKNOWN').toUpperCase()} size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }} />
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>{req.id.slice(0, 8).toUpperCase()}</Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <Typography sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: '0.85rem' }}>{req.propertyName || 'GENERAL ASSET'}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>{req.propertyLocation || 'Location Pending'}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip label={String(req.scope?.zoneType || req.roomType || 'UNKNOWN').toUpperCase()} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950, fontSize: '0.6rem' }} />
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 950, color: '#FFF' }}>
                                        {req.quote?.finalTotal ? `AED ${Math.round(req.quote.finalTotal).toLocaleString()}` : req.budget ? `AED ${req.budget.toLocaleString()}` : 'PENDING'}
                                        <Typography variant="caption" sx={{ color: '#f59e0b', display: 'block', mt: 0.5 }}>
                                            15%: {req.quote?.finalTotal ? `AED ${Math.round(req.quote.finalTotal * 0.15).toLocaleString()}` : 'Pending'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={String(req.status || 'SUBMITTED').replace(/_/g, ' ').toUpperCase()}
                                            size="small"
                                            sx={{ bgcolor: alpha(color, 0.1), color, border: `1px solid ${alpha(color, 0.2)}`, fontWeight: 950, fontSize: '0.6rem', maxWidth: 220 }}
                                        />
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', display: 'block', mt: 0.75 }}>
                                            {req.adminHandoffStatus || req.paymentStatus || req.approvalStatus || 'Awaiting governance'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton size="small" onClick={() => { setSelectedRequest(req); setIsDetailsOpen(true); }}>
                                            <Eye size={18} color={binThemeTokens.gold} />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog
                open={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}
            >
                <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold, borderBottom: '1px solid rgba(255,255,255,0.05)', py: 3 }}>
                    DESIGN DOSSIER: {selectedRequest?.id.slice(0, 8).toUpperCase()}
                </DialogTitle>
                <DialogContent sx={{ py: 4 }}>
                    {selectedRequest && (
                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}>
                                <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, mb: 1, display: 'block' }}>REFERENCE CAPTURE</Typography>
                                <Box sx={{ width: '100%', height: 300, borderRadius: 3, overflow: 'hidden', bgcolor: '#000', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    {selectedRequest.scope?.referenceImages?.[0] || selectedRequest.originalImage ? (
                                        <img src={selectedRequest.scope?.referenceImages?.[0] || selectedRequest.originalImage} alt="Reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', p: 3, textAlign: 'center' }}>
                                            <Typography variant="caption" color="rgba(255,255,255,0.45)">NO VISUAL EVIDENCE PROVIDED</Typography>
                                        </Box>
                                    )}
                                </Box>
                                {!(selectedRequest.scope?.referenceImages?.[0] || selectedRequest.originalImage) && (
                                    <Alert severity="warning" sx={{ mt: 2, bgcolor: 'rgba(245,158,11,0.08)', color: '#fbbf24' }}>
                                        Do not proceed to execution until before-image evidence is uploaded or captured on site.
                                    </Alert>
                                )}
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Stack spacing={3}>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block' }}>CLIENT IDENTITY</Typography>
                                        <Typography variant="h5" fontWeight="950" color="#FFF">{selectedRequest.userName || selectedRequest.ownerName || 'Unspecified'}</Typography>
                                        <Typography variant="caption" color="rgba(255,255,255,0.4)">ROLE: {String(selectedRequest.role || 'UNKNOWN').toUpperCase()}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>ASSET TARGET</Typography>
                                        <Typography variant="body1" fontWeight="800" color="#FFF">{selectedRequest.propertyName}</Typography>
                                        <Typography variant="caption" color="rgba(255,255,255,0.5)">{selectedRequest.propertyLocation || 'Location Pending'}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>WORKFLOW STATUS</Typography>
                                        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                                            <Chip label={String(selectedRequest.status || 'UNKNOWN').replace(/_/g, ' ')} size="small" sx={{ color: statusTone(selectedRequest.status), borderColor: alpha(statusTone(selectedRequest.status), 0.25), fontWeight: 900 }} variant="outlined" />
                                            <Chip label={selectedRequest.paymentStatus || 'PAYMENT NOT STARTED'} size="small" sx={{ color: '#f59e0b', borderColor: alpha('#f59e0b', 0.25), fontWeight: 900 }} variant="outlined" />
                                        </Stack>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>FINANCIAL PARAMETERS</Typography>
                                        <Typography variant="h6" fontWeight="950" color="#10b981">
                                            {selectedRequest.quote?.finalTotal ? `AED ${Math.round(selectedRequest.quote.finalTotal).toLocaleString()}` : selectedRequest.budget ? `AED ${selectedRequest.budget.toLocaleString()}` : 'QUOTE PENDING'}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: '#f59e0b' }}>
                                            15% Mobilization: {selectedRequest.quote?.finalTotal ? `AED ${Math.round(selectedRequest.quote.finalTotal * 0.15).toLocaleString()}` : 'Pending'}
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.01)', flexWrap: 'wrap', gap: 1 }}>
                    <Button onClick={() => setIsDetailsOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CLOSE</Button>
                    <Box sx={{ flexGrow: 1 }} />
                    <Button
                        variant="outlined"
                        startIcon={<CreditCard size={18} />}
                        onClick={() => selectedRequest && handleWorkflowAction(selectedRequest.id, 'MARK_PAYMENT_PENDING')}
                        disabled={processing || !selectedRequest}
                        sx={{ fontWeight: 950, borderRadius: 2, borderColor: '#f59e0b', color: '#f59e0b' }}
                    >
                        PAYMENT PENDING
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<Hammer size={18} />}
                        onClick={() => selectedRequest && handleWorkflowAction(selectedRequest.id, 'ENGINEER_REVIEW')}
                        disabled={processing || !selectedRequest}
                        sx={{ fontWeight: 950, borderRadius: 2, borderColor: binThemeTokens.gold, color: binThemeTokens.gold }}
                    >
                        ENGINEER REVIEW
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<XCircle size={18} />}
                        onClick={() => selectedRequest && handleWorkflowAction(selectedRequest.id, 'ADMIN_REJECT')}
                        disabled={processing || !selectedRequest}
                        sx={{ fontWeight: 950, borderRadius: 2 }}
                    >
                        REJECT
                    </Button>
                    <Button
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircle size={18} />}
                        onClick={() => selectedRequest && handleWorkflowAction(selectedRequest.id, 'ADMIN_APPROVE_EXECUTION')}
                        disabled={processing || !selectedRequest}
                        sx={{ fontWeight: 950, borderRadius: 2, bgcolor: '#10b981' }}
                    >
                        APPROVE EXECUTION
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}
