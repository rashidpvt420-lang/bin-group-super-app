import React, { useState, useEffect } from 'react';
import { 
    Box, Grid, Paper, Button, Typography, 
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, alpha, IconButton, Stack, Dialog, DialogTitle, DialogContent,
    DialogActions
} from '@mui/material';
import { 
    Eye, UserPlus, CheckCircle, XCircle 
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

interface DesignRequest {
    id: string;
    ownerName?: string;
    propertyName?: string;
    roomType: string;
    theme: string;
    budget?: number;
    status: 'draft' | 'submitted' | 'quoted' | 'approved' | 'rejected';
    createdAt: any;
    originalImage?: string;
}

export default function DesignStudioAdminPage() {
    const { t } = useLanguage();
    const [requests, setRequests] = useState<DesignRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState<DesignRequest | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'design_requests'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as DesignRequest[];
            setRequests(fetched);
            setLoading(false);
        }, (error) => {
            console.error("Design Requests Error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleStatusUpdate = async (id: string, newStatus: string) => {
        try {
            await updateDoc(doc(db, 'design_requests', id), { status: newStatus });
            setIsDetailsOpen(false);
        } catch (err) {
            console.error(err);
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
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{t('design.table.owner')?.toUpperCase() || 'OWNER'}</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{t('design.table.property')?.toUpperCase() || 'PROPERTY'}</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{t('step.type')?.toUpperCase() || 'TYPE'}</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{t('design.table.budget')?.toUpperCase() || 'BUDGET'}</TableCell>
                            <TableCell sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{t('design.table.status')?.toUpperCase() || 'STATUS'}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: '#020617', color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{t('common.actions')?.toUpperCase() || 'ACTIONS'}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {requests.map((req) => (
                            <TableRow key={req.id} hover>
                                <TableCell>
                                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>{req.ownerName || 'UNSPECIFIED OWNER'}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem' }}>{req.id.slice(0, 8).toUpperCase()}</Typography>
                                </TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>{req.propertyName || 'GENERAL ASSET'}</TableCell>
                                <TableCell>
                                    <Chip label={req.roomType?.toUpperCase() || 'UNKNOWN'} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950, fontSize: '0.6rem' }} />
                                </TableCell>
                                <TableCell sx={{ fontWeight: 950, color: '#FFF' }}>
                                    {req.budget ? `AED ${req.budget.toLocaleString()}` : 'FLEXIBLE'}
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={req.status?.toUpperCase() || 'SUBMITTED'} 
                                        size="small"
                                        sx={{ 
                                            bgcolor: req.status === 'approved' ? alpha('#10b981', 0.1) : req.status === 'rejected' ? alpha('#EF4444', 0.1) : 'rgba(255,255,255,0.05)',
                                            color: req.status === 'approved' ? '#10b981' : req.status === 'rejected' ? '#EF4444' : 'rgba(255,255,255,0.4)',
                                            fontWeight: 950, fontSize: '0.6rem'
                                        }}
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                                        <IconButton size="small" onClick={() => { setSelectedRequest(req); setIsDetailsOpen(true); }}>
                                            <Eye size={18} color={binThemeTokens.gold} />
                                        </IconButton>
                                        <IconButton size="small">
                                            <UserPlus size={18} color="rgba(255,255,255,0.2)" />
                                        </IconButton>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        ))}
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
                                    {selectedRequest.originalImage ? (
                                        <img src={selectedRequest.originalImage} alt="Reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                            <Typography variant="caption" color="rgba(255,255,255,0.2)">NO VISUAL EVIDENCE PROVIDED</Typography>
                                        </Box>
                                    )}
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Stack spacing={3}>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block' }}>CLIENT IDENTITY</Typography>
                                        <Typography variant="h5" fontWeight="950" color="#FFF">{selectedRequest.ownerName}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>ASSET TARGET</Typography>
                                        <Typography variant="body1" fontWeight="800" color="#FFF">{selectedRequest.propertyName}</Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>SPECIFICATIONS</Typography>
                                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                            <Chip label={selectedRequest.roomType} size="small" variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.1)', fontWeight: 800 }} />
                                            <Chip label={selectedRequest.theme} size="small" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.2), fontWeight: 800 }} />
                                        </Stack>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>FINANCIAL PARAMETERS</Typography>
                                        <Typography variant="h6" fontWeight="950" color="#10b981">
                                            {selectedRequest.budget ? `AED ${selectedRequest.budget.toLocaleString()}` : 'FLEXIBLE BUDGET'}
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.01)' }}>
                    <Button onClick={() => setIsDetailsOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CLOSE</Button>
                    <Box sx={{ flexGrow: 1 }} />
                    <Button 
                        variant="outlined" 
                        color="error" 
                        startIcon={<XCircle size={18} />} 
                        onClick={() => selectedRequest && handleStatusUpdate(selectedRequest.id, 'rejected')}
                        sx={{ fontWeight: 950, borderRadius: 2 }}
                    >
                        REJECT
                    </Button>
                    <Button 
                        variant="contained" 
                        color="success" 
                        startIcon={<CheckCircle size={18} />} 
                        onClick={() => selectedRequest && handleStatusUpdate(selectedRequest.id, 'approved')}
                        sx={{ fontWeight: 950, borderRadius: 2, bgcolor: '#10b981' }}
                    >
                        APPROVE & QUOTE
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}
