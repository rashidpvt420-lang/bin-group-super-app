import React, { useState, useEffect } from 'react';
import {
    Container,
    Paper,
    Grid,
    Typography,
    Box,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Card,
    CardContent,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';


interface PartApproval {
    id: string;
    ticketId: string;
    ownerName: string;
    partName: string;
    wholesaleCost: number;
    markupPercent: number;
    finalPrice: number;
    status: 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED';
    photoUrl: string;
}

export default function PartsStorePage() {
    const [approvals, setApprovals] = useState<PartApproval[]>([]);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    useEffect(() => {
        const q = query(collection(db, "part_approvals"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const data: PartApproval[] = [];
            querySnapshot.forEach((doc) => {
                data.push({ id: doc.id, ...doc.data() } as PartApproval);
            });
            setApprovals(data);
        });

        return () => unsubscribe();
    }, []);

    const getStatusChip = (status: string) => {
        switch (status) {
            case 'PENDING': return <Chip icon={<WarningIcon />} label="Waiting for Landlord" color="warning" />;
            case 'APPROVED': return <Chip icon={<CheckCircleIcon />} label="Approved (Unpaid)" color="info" />;
            case 'PAID': return <Chip icon={<CheckCircleIcon />} label="Paid & Ready" color="success" />;
            default: return <Chip label={status} />;
        }
    };

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="bold">Parts Procurement & Approvals</Typography>
                <Box>
                    <Typography variant="subtitle2" color="textSecondary">Standard App Markup:</Typography>
                    <Typography variant="h6" color="primary" fontWeight="bold">15% - 20%</Typography>
                </Box>
            </Box>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <CardContent>
                            <Typography color="primary" variant="overline" fontWeight="bold">Pending Revenue</Typography>
                            <Typography variant="h4" fontWeight="bold">AED 14,200</Typography>
                            <Typography variant="caption">From unapproved parts quotes</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                        <CardContent>
                            <Typography color="success.main" variant="overline" fontWeight="bold">Procurement Margin</Typography>
                            <Typography variant="h4" fontWeight="bold">AED 3,450</Typography>
                            <Typography variant="caption">Profit from markup this month</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card sx={{ bgcolor: '#fdf2f2', border: '1px solid #fecaca' }}>
                        <CardContent>
                            <Typography color="error" variant="overline" fontWeight="bold">Avg Approval Time</Typography>
                            <Typography variant="h4" fontWeight="bold">4.2 Hours</Typography>
                            <Typography variant="caption">Push notification response rate</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
                <Table>
                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Part & Diagnostic</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Landlord / Unit</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Wholesale</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Markup</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Client Price</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>Status</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>Action</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {approvals.map((app) => (
                            <TableRow key={app.id} hover>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Box
                                            component="img"
                                            src={app.photoUrl}
                                            sx={{ width: 40, height: 40, borderRadius: 1, cursor: 'pointer' }}
                                            onClick={() => setSelectedImage(app.photoUrl)}
                                        />
                                        <Box>
                                            <Typography variant="body2" fontWeight="bold">{app.partName}</Typography>
                                            <Typography variant="caption" color="textSecondary">Ref: {app.id}</Typography>
                                        </Box>
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2">{app.ownerName}</Typography>
                                    <Typography variant="caption" color="primary">{app.ticketId}</Typography>
                                </TableCell>
                                <TableCell align="right">AED {app.wholesaleCost}</TableCell>
                                <TableCell align="right">+{app.markupPercent}%</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold', color: '#16a34a' }}>AED {app.finalPrice}</TableCell>
                                <TableCell align="center">{getStatusChip(app.status)}</TableCell>
                                <TableCell align="center">
                                    <Button size="small" variant="outlined">Resend Alert</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={!!selectedImage} onClose={() => setSelectedImage(null)} maxWidth="sm">
                <DialogTitle>Technician Evidence</DialogTitle>
                <DialogContent>
                    {selectedImage && <Box component="img" src={selectedImage} sx={{ width: '100%', borderRadius: 2 }} />}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSelectedImage(null)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
