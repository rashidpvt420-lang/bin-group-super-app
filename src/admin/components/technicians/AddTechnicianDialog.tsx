import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Button, Stack, FormControl, InputLabel,
    Select, MenuItem, Typography, CircularProgress,
    Alert, alpha, Grid
} from '@mui/material';
import { db, collection, doc, query, where, getDocs, setDoc, serverTimestamp } from '../../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import { UserPlus } from 'lucide-react';

interface AddTechnicianDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (msg: string) => void;
}

const TRADES = [
    'HVAC / AC', 'Electrical', 'Plumbing', 'Civil / Handyman',
    'Cleaning', 'Security', 'Landscaping', 'Pest Control',
    'General Maintenance', 'Multi-Skilled'
];

const SKILL_LEVELS = ['Junior', 'Technician', 'Senior Technician', 'Specialist', 'Supervisor'];
const VEHICLE_TYPES = ['Company Van', 'Company Pickup', 'Motorbike', 'Own Vehicle', 'No Vehicle'];

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const emailKey = (value: string) => normalizeEmail(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `technician_${Date.now()}`;

export default function AddTechnicianDialog({ open, onClose, onSuccess }: AddTechnicianDialogProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        displayName: '',
        email: '',
        phone: '',
        specialization: 'General Maintenance',
        trade: 'General Maintenance',
        skillLevel: 'Specialist',
        vehicle: 'Company Van',
        toolKit: 'Standard maintenance toolkit',
        certifications: 'AC safety, electrical safety, ladder safety',
        ppeIssued: 'Helmet, vest, gloves, safety shoes',
        drivingLicense: 'Pending verification',
        supervisorName: 'Operations Supervisor',
        baseLocation: 'UAE field operations',
        shiftName: 'Standard day shift',
        contractType: 'Field operations',
        status: 'ACTIVE'
    });

    const updateField = (field: keyof typeof formData, value: string) => setFormData((prev) => ({ ...prev, [field]: value }));

    const handleSave = async () => {
        const email = normalizeEmail(formData.email);
        if (!formData.displayName.trim() || !email) {
            setError('Name and email are required.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const existing = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
            const targetUserId = existing.docs[0]?.id || `tech_${emailKey(email)}`;
            const operationalProfile = {
                ...formData,
                email,
                role: 'technician',
                trade: formData.trade || formData.specialization,
                specialization: formData.specialization || formData.trade,
                primaryTrade: formData.trade || formData.specialization,
                certifications: formData.certifications.split(',').map((item) => item.trim()).filter(Boolean),
                ppeIssued: formData.ppeIssued,
                drivingLicense: formData.drivingLicense,
                onboardingComplete: true,
                technicianProfileSynced: true,
                dispatchReady: true,
                onDuty: false,
                dutyStatus: 'OFF',
                rating: 5.0,
                qualityScore: 5,
                slaCompliance: 'Healthy',
                completedJobs: 0,
                activeJobs: 0,
                updatedAt: serverTimestamp(),
            };

            await setDoc(doc(db, 'users', targetUserId), {
                ...operationalProfile,
                uid: targetUserId,
                createdAt: serverTimestamp(),
            }, { merge: true });

            await setDoc(doc(db, 'technicians', targetUserId), {
                ...operationalProfile,
                uid: targetUserId,
                technicianId: targetUserId,
                createdAt: serverTimestamp(),
            }, { merge: true });

            await setDoc(doc(db, 'staff_roster', targetUserId), {
                uid: targetUserId,
                technicianId: targetUserId,
                displayName: formData.displayName,
                email,
                phone: formData.phone,
                role: 'technician',
                status: 'active',
                shift: formData.shiftName,
                dutyStatus: 'OFF',
                baseLocation: formData.baseLocation,
                supervisorName: formData.supervisorName,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
            }, { merge: true });

            onSuccess(`Technician ${formData.displayName} profile synced to users, technicians, and staff roster.`);
            setFormData({
                displayName: '', email: '', phone: '', specialization: 'General Maintenance', trade: 'General Maintenance',
                skillLevel: 'Specialist', vehicle: 'Company Van', toolKit: 'Standard maintenance toolkit',
                certifications: 'AC safety, electrical safety, ladder safety', ppeIssued: 'Helmet, vest, gloves, safety shoes',
                drivingLicense: 'Pending verification', supervisorName: 'Operations Supervisor', baseLocation: 'UAE field operations',
                shiftName: 'Standard day shift', contractType: 'Field operations', status: 'ACTIVE'
            });
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to add technician');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            maxWidth="md" 
            fullWidth
            PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` } }}
        >
            <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold, display: 'flex', alignItems: 'center', gap: 2 }}>
                <UserPlus size={24} /> ACTIVATE FIELD TECHNICIAN
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <Typography sx={{ mb: 3, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                    Register and sync the technician across users, technicians, and staff roster so the field dashboard no longer shows Pending sync.
                </Typography>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Grid container spacing={2.5}>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Full Name *" value={formData.displayName} onChange={(e) => updateField('displayName', e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Email Address *" type="email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Phone / WhatsApp" value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} /></Grid>
                    <Grid item xs={12} md={6}><FormControl fullWidth><InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Trade Specialization</InputLabel><Select value={formData.specialization} label="Trade Specialization" onChange={(e) => { updateField('specialization', e.target.value); updateField('trade', e.target.value); }} sx={{ color: '#FFF', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}>{TRADES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}</Select></FormControl></Grid>
                    <Grid item xs={12} md={6}><FormControl fullWidth><InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Skill Level</InputLabel><Select value={formData.skillLevel} label="Skill Level" onChange={(e) => updateField('skillLevel', e.target.value)} sx={{ color: '#FFF', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}>{SKILL_LEVELS.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}</Select></FormControl></Grid>
                    <Grid item xs={12} md={6}><FormControl fullWidth><InputLabel sx={{ color: 'rgba(255,255,255,0.4)' }}>Vehicle</InputLabel><Select value={formData.vehicle} label="Vehicle" onChange={(e) => updateField('vehicle', e.target.value)} sx={{ color: '#FFF', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}>{VEHICLE_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}</Select></FormControl></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Tool Kit" value={formData.toolKit} onChange={(e) => updateField('toolKit', e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Certifications comma separated" value={formData.certifications} onChange={(e) => updateField('certifications', e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="PPE Issued" value={formData.ppeIssued} onChange={(e) => updateField('ppeIssued', e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} /></Grid>
                    <Grid item xs={12} md={6}><TextField fullWidth label="Driving License" value={formData.drivingLicense} onChange={(e) => updateField('drivingLicense', e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth label="Supervisor" value={formData.supervisorName} onChange={(e) => updateField('supervisorName', e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth label="Base Location" value={formData.baseLocation} onChange={(e) => updateField('baseLocation', e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} /></Grid>
                    <Grid item xs={12} md={4}><TextField fullWidth label="Shift" value={formData.shiftName} onChange={(e) => updateField('shiftName', e.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.4)' } }} InputProps={{ style: { color: '#FFF' } }} sx={{ '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }} /></Grid>
                </Grid>
            </DialogContent>
            <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>ABORT</Button>
                <Button variant="contained" onClick={handleSave} disabled={loading} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}>
                    {loading ? <CircularProgress size={20} color="inherit" /> : 'SYNC TECHNICIAN PROFILE'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
