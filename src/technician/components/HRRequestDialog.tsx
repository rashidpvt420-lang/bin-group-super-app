import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, FormControl, InputLabel, Select, MenuItem,
    Stack, Typography, Alert, CircularProgress
} from '@mui/material';
import { FileText, Send } from 'lucide-react';
import { db, collection, addDoc, serverTimestamp } from '@/lib/firebase';
import { useRole } from '@/context/RoleContext';

const REQUEST_TYPES = [
    { value: 'leave_request', label: 'Leave Request' },
    { value: 'salary_certificate', label: 'Salary Certificate' },
    { value: 'overtime_approval', label: 'Overtime Approval' },
    { value: 'sick_leave', label: 'Sick Leave' },
    { value: 'document_request', label: 'Document Request' },
    { value: 'complaint_grievance', label: 'Complaint / Grievance' },
    { value: 'shift_correction', label: 'Shift Correction' },
];

interface HRRequestDialogProps {
    open: boolean;
    onClose: () => void;
}

export default function HRRequestDialog({ open, onClose }: HRRequestDialogProps) {
    const { user } = useRole();
    const [type, setType] = useState('leave_request');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!reason) {
            setError('Please provide details for your request.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await addDoc(collection(db, 'hrRequests'), {
                uid: user?.uid,
                staffName: user?.displayName,
                staffRole: user?.role,
                type,
                reason,
                status: 'PENDING',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            await addDoc(collection(db, 'auditLogs'), {
                action: 'HR_REQUEST_SUBMITTED',
                actorId: user?.uid,
                actorName: user?.displayName,
                details: `Submitted ${type} request`,
                timestamp: serverTimestamp()
            });

            setSuccess(true);
            setTimeout(() => {
                onClose();
                setSuccess(false);
                setReason('');
                setType('leave_request');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Failed to submit request.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#0f172a', color: '#fff', borderRadius: 4 } }}>
            <DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <FileText color="#C6A75E" />
                    <Typography variant="h6" fontWeight="950">SUBMIT HR REQUEST</Typography>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ mt: 3 }}>
                {success && <Alert severity="success" sx={{ mb: 2 }}>Request submitted successfully!</Alert>}
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                
                <Stack spacing={3}>
                    <FormControl fullWidth>
                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Request Type</InputLabel>
                        <Select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            label="Request Type"
                            sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                        >
                            {REQUEST_TYPES.map(rt => <MenuItem key={rt.value} value={rt.value}>{rt.label}</MenuItem>)}
                        </Select>
                    </FormControl>

                    <TextField
                        fullWidth
                        multiline
                        rows={4}
                        label="Details / Reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        variant="outlined"
                        sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' } } }}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
                <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CANCEL</Button>
                <Button 
                    variant="contained" 
                    onClick={handleSubmit} 
                    disabled={loading || success}
                    startIcon={loading ? <CircularProgress size={18} /> : <Send size={18} />}
                    sx={{ bgcolor: '#C6A75E', color: '#000', fontWeight: 950, px: 4 }}
                >
                    SUBMIT
                </Button>
            </DialogActions>
        </Dialog>
    );
}
