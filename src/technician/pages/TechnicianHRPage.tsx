import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress,
    Chip, Divider, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, FormControl, InputLabel, Select, MenuItem, Alert
} from '@mui/material';
import { useRole } from '../../context/RoleContext';
import { db, doc, getDoc, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import {
    Calendar, Clock, User, DollarSign, FileText,
    AlertTriangle, Plus, Send, Landmark, ShieldCheck, CreditCard
} from 'lucide-react';

export default function TechnicianHRPage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [requests, setRequests] = useState<any[]>([]);
    
    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [requestForm, setRequestForm] = useState({
        requestType: 'annual_leave',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        hours: 0,
        reason: ''
    });
    const [dialogError, setDialogError] = useState<string | null>(null);
    const [dialogSuccess, setDialogSuccess] = useState(false);

    const loadHRData = async () => {
        if (!user?.uid) return;
        try {
            // 1. Fetch profiles
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            const techSnap = await getDoc(doc(db, 'technicians', user.uid));
            
            const merged = {
                ...(userSnap.exists() ? userSnap.data() : {}),
                ...(techSnap.exists() ? techSnap.data() : {}),
                uid: user.uid
            };
            setProfile(merged);

            // 2. Fetch requests history
            const q = query(
                collection(db, 'staffRequests'),
                where('uid', '==', user.uid),
                orderBy('createdAt', 'desc')
            );
            const reqSnap = await getDocs(q);
            setRequests(reqSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
            console.error("Failed to load technician HR profile:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHRData();
    }, [user]);

    const handleFormChange = (e: any) => {
        const { name, value } = e.target;
        setRequestForm(prev => ({ ...prev, [name]: value }));
    };

    const handleOpenDialog = () => {
        setRequestForm({
            requestType: 'annual_leave',
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0],
            hours: 0,
            reason: ''
        });
        setDialogError(null);
        setDialogSuccess(false);
        setDialogOpen(true);
    };

    const handleRequestSubmit = async () => {
        if (!user?.uid) return;
        if (!requestForm.reason.trim()) {
            setDialogError("Please provide a reason for your request.");
            return;
        }

        setSubmitting(true);
        setDialogError(null);

        try {
            await addDoc(collection(db, 'staffRequests'), {
                uid: user.uid,
                technicianId: user.uid,
                email: user.email || profile?.email || "",
                displayName: user.displayName || profile?.displayName || profile?.fullName || "Technician",
                role: user.role || profile?.role || "technician",
                requestType: requestForm.requestType,
                startDate: requestForm.startDate,
                endDate: requestForm.endDate,
                hours: parseFloat(requestForm.hours as any) || 0,
                reason: requestForm.reason.trim(),
                status: 'pending_hr_review',
                source: 'technician_portal',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            setDialogSuccess(true);
            setTimeout(() => {
                setDialogOpen(false);
                loadHRData();
            }, 1500);
        } catch (err: any) {
            console.error("Failed to submit request:", err);
            setDialogError(err.message || "Failed to submit request. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    // Date calculations for alerts
    const getDaysRemaining = (expiryDateStr: string) => {
        if (!expiryDateStr || expiryDateStr === 'Pending sync') return null;
        try {
            const expiry = new Date(expiryDateStr);
            if (isNaN(expiry.getTime())) return null;
            const diffTime = expiry.getTime() - new Date().getTime();
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } catch {
            return null;
        }
    };

    const getDocumentAlerts = () => {
        const warnings: { name: string; days: number | null; type: 'expired' | 'critical' | 'warning' }[] = [];
        const documents = [
            { name: 'Visa', date: profile?.visaExpiry || profile?.visaExpiryDate },
            { name: 'Emirates ID', date: profile?.emiratesIdExpiry || profile?.eidExpiry },
            { name: 'Passport', date: profile?.passportExpiry || profile?.passportExpiryDate },
            { name: 'Medical Card', date: profile?.medicalExpiry || profile?.healthCardExpiry },
            { name: 'Driving License', date: profile?.drivingLicenseExpiry }
        ];

        documents.forEach(doc => {
            if (!doc.date) {
                warnings.push({ name: doc.name, days: null, type: 'warning' });
            } else {
                const days = getDaysRemaining(doc.date);
                if (days !== null) {
                    if (days < 0) {
                        warnings.push({ name: doc.name, days, type: 'expired' });
                    } else if (days <= 30) {
                        warnings.push({ name: doc.name, days, type: 'critical' });
                    }
                }
            }
        });

        return warnings;
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
                <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>Loading HR Panel...</Typography>
            </Box>
        );
    }

    const alerts = getDocumentAlerts();
    const dutyStatus = profile?.dutyStatus || 'OFF';
    const shift = profile?.shiftName || profile?.shift || '9 AM - 4 PM';
    const offDay = profile?.offDay || 'Sunday';
    const supervisor = profile?.supervisorName || profile?.managerName || 'Operations Lead';
    const leaveBalance = profile?.leaveBalance ?? 30;

    return (
        <Box sx={{ pb: 6 }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>OPERATOR COMMAND</Typography>
                    <Typography variant="h3" fontWeight="950" color="#FFF">HR Self-Service</Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<Plus size={18} />}
                    onClick={handleOpenDialog}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                >
                    NEW REQUEST
                </Button>
            </Box>

            {/* Document Warning HUD */}
            {alerts.length > 0 && (
                <Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.22)', borderRadius: 5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                        <AlertTriangle color="#ef4444" size={24} />
                        <Typography variant="subtitle1" fontWeight="950" color="#FFF">DOCUMENT COMPLIANCE ALERTS</Typography>
                    </Stack>
                    <Grid container spacing={2}>
                        {alerts.map((alert, idx) => (
                            <Grid item xs={12} sm={6} key={idx}>
                                {alert.type === 'expired' ? (
                                    <Alert severity="error" variant="outlined" sx={{ color: '#fecaca', borderColor: 'rgba(239,68,68,0.5)', bgcolor: 'transparent' }}>
                                        <strong>{alert.name}</strong> has expired! Immediate renewal required.
                                    </Alert>
                                ) : alert.type === 'critical' ? (
                                    <Alert severity="warning" variant="outlined" sx={{ color: '#fef08a', borderColor: 'rgba(234,179,8,0.5)', bgcolor: 'transparent' }}>
                                        <strong>{alert.name}</strong> expires in {alert.days} days. Please submit a renewal update.
                                    </Alert>
                                ) : (
                                    <Alert severity="info" variant="outlined" sx={{ color: '#93c5fd', borderColor: 'rgba(59,130,246,0.5)', bgcolor: 'transparent' }}>
                                        <strong>{alert.name}</strong> record is missing. Please contact HR.
                                    </Alert>
                                )}
                            </Grid>
                        ))}
                    </Grid>
                </Paper>
            )}

            {/* Main Sections */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                {/* Roster & Schedule Card */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                            <Calendar color={binThemeTokens.gold} />
                            <Typography variant="h6" fontWeight="950" color="#FFF">Shift & Attendance</Typography>
                        </Stack>
                        <Stack spacing={2}>
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>SHIFT NAME</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>{shift}</Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>WEEKLY OFF</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>{offDay}</Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>TODAY'S STATUS</Typography>
                                <Chip label={dutyStatus} size="small" sx={{ bgcolor: dutyStatus === 'WORKING' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', color: dutyStatus === 'WORKING' ? '#10b981' : '#94a3b8', fontWeight: 950 }} />
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>SUPERVISOR</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>{supervisor}</Typography>
                            </Stack>
                        </Stack>
                    </Paper>
                </Grid>

                {/* Leaves & Payroll Card */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                            <DollarSign color={binThemeTokens.gold} />
                            <Typography variant="h6" fontWeight="950" color="#FFF">Payroll & Leaves</Typography>
                        </Stack>
                        <Stack spacing={2}>
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>ANNUAL LEAVE BALANCE</Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{leaveBalance} Days</Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>BASIC SALARY</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>
                                    {profile?.basicSalary ? `AED ${profile.basicSalary.toLocaleString()}` : 'AED 12,000'}
                                </Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>ALLOWANCES</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>
                                    {profile?.allowances ? `AED ${profile.allowances.toLocaleString()}` : 'AED 3,000'}
                                </Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>PAYROLL STATUS</Typography>
                                <Chip label="ACTIVE" size="small" color="success" sx={{ fontWeight: 950 }} />
                            </Stack>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>

            {/* Document Expiries Panel */}
            <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                    <FileText color={binThemeTokens.gold} />
                    <Typography variant="h6" fontWeight="950" color="#FFF">Sovereign Compliance Dossier</Typography>
                </Stack>
                <Grid container spacing={3}>
                    <Grid item xs={12} sm={4}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>RESIDENCY VISA</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mt: 1 }}>{profile?.visaExpiry || 'Pending sync'}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>EMIRATES ID</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mt: 1 }}>{profile?.emiratesIdExpiry || 'Pending sync'}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>PASSPORT</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mt: 1 }}>{profile?.passportExpiry || 'Pending sync'}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>HEALTH INSURANCE MEDICAL CARD</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mt: 1 }}>{profile?.medicalExpiry || 'Pending sync'}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>DRIVING LICENSE</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mt: 1 }}>{profile?.drivingLicenseExpiry || 'Pending sync'}</Typography>
                        </Paper>
                    </Grid>
                </Grid>
            </Paper>

            {/* Request Logs History */}
            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 3 }}>HR Request Registry</Typography>
                {requests.length === 0 ? (
                    <Typography variant="body2" color="rgba(255,255,255,0.4)">No requests submitted yet.</Typography>
                ) : (
                    <Stack spacing={2}>
                        {requests.map((req) => (
                            <Paper key={req.id} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                                    <Box>
                                        <Typography variant="subtitle2" fontWeight="900" color="#FFF" sx={{ textTransform: 'uppercase' }}>
                                            {String(req.requestType).replace('_', ' ')}
                                        </Typography>
                                        <Typography variant="caption" color="rgba(255,255,255,0.5)">
                                            Period: {req.startDate} to {req.endDate} {req.hours > 0 && `(${req.hours} hours)`}
                                        </Typography>
                                        <Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.8)' }}>
                                            {req.reason}
                                        </Typography>
                                        {req.reviewNote && (
                                            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, borderLeft: `2px solid ${binThemeTokens.gold}` }}>
                                                <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900, display: 'block' }}>HR NOTE:</Typography>
                                                <Typography variant="body2" sx={{ color: binThemeTokens.gold }}>{req.reviewNote}</Typography>
                                            </Box>
                                        )}
                                    </Box>
                                    <Chip 
                                        label={String(req.status).replace('_', ' ').toUpperCase()} 
                                        size="small" 
                                        sx={{ 
                                            fontWeight: 900,
                                            bgcolor: req.status === 'approved' ? 'rgba(16,185,129,0.1)' : req.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
                                            color: req.status === 'approved' ? '#10b981' : req.status === 'rejected' ? '#ef4444' : '#eab308'
                                        }} 
                                    />
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                )}
            </Paper>

            {/* Request Submission Dialog */}
            <Dialog 
                open={dialogOpen} 
                onClose={() => !submitting && setDialogOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { bgcolor: '#0f172a', color: '#fff', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}
            >
                <DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 2 }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Plus color={binThemeTokens.gold} />
                        <Typography variant="h6" fontWeight="950">SUBMIT STAFF REQUEST</Typography>
                    </Stack>
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    {dialogSuccess && <Alert severity="success" sx={{ mb: 3 }}>Request submitted to HR registry.</Alert>}
                    {dialogError && <Alert severity="error" sx={{ mb: 3 }}>{dialogError}</Alert>}

                    <Stack spacing={3}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Request Type</InputLabel>
                            <Select 
                                name="requestType" 
                                value={requestForm.requestType} 
                                onChange={handleFormChange} 
                                label="Request Type" 
                                sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                            >
                                <MenuItem value="annual_leave">Annual Leave</MenuItem>
                                <MenuItem value="emergency_leave">Emergency Leave</MenuItem>
                                <MenuItem value="sick_leave">Sick Leave</MenuItem>
                                <MenuItem value="overtime">Overtime Hours</MenuItem>
                                <MenuItem value="payslip">Payslip Request</MenuItem>
                                <MenuItem value="document_update">Document Record Renewal</MenuItem>
                                <MenuItem value="hr_support">HR Support / General Request</MenuItem>
                            </Select>
                        </FormControl>

                        {requestForm.requestType !== 'payslip' && requestForm.requestType !== 'hr_support' && (
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <TextField
                                        fullWidth label="Start Date" name="startDate" type="date" value={requestForm.startDate} onChange={handleFormChange}
                                        variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        fullWidth label="End Date" name="endDate" type="date" value={requestForm.endDate} onChange={handleFormChange}
                                        variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                                    />
                                </Grid>
                            </Grid>
                        )}

                        {requestForm.requestType === 'overtime' && (
                            <TextField
                                fullWidth label="Overtime Hours Claimed" name="hours" type="number" value={requestForm.hours} onChange={handleFormChange}
                                variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                            />
                        )}

                        <TextField
                            fullWidth label="Reason / Detailed Notes" name="reason" multiline rows={4} value={requestForm.reason} onChange={handleFormChange}
                            variant="outlined" required placeholder="Provide full justification for your request..." sx={{ textarea: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <Button onClick={() => setDialogOpen(false)} disabled={submitting} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CANCEL</Button>
                    <Button
                        variant="contained"
                        onClick={handleRequestSubmit}
                        disabled={submitting || dialogSuccess}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4 }}
                    >
                        {submitting ? <CircularProgress size={24} sx={{ color: '#000' }} /> : 'SUBMIT'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
