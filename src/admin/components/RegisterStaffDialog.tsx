import React, { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Grid, FormControl, InputLabel, Select, MenuItem,
    Typography, Stack, Alert, CircularProgress, Divider,
    Checkbox, FormControlLabel, Box
} from '@mui/material';
import { UserPlus, Shield, Info, Briefcase, DollarSign, MapPin } from 'lucide-react';
import { 
    db, collection, addDoc, serverTimestamp, setDoc, doc 
} from '@/lib/firebase';
import { useAuth } from '@/admin/context/AuthContext';

const STAFF_ROLES = [
    { value: 'technician', label: 'Technician' },
    { value: 'hr_staff', label: 'HR Staff' },
    { value: 'hr_manager', label: 'HR Manager' },
    { value: 'finance_staff', label: 'Finance Staff' },
    { value: 'dispatcher', label: 'Dispatcher' },
    { value: 'admin_assistant', label: 'Admin Assistant' },
    { value: 'account_manager', label: 'Account Manager' },
    { value: 'operations_manager', label: 'Operations Manager' },
    { value: 'finance_admin', label: 'Finance Admin' },
];

const DEPARTMENTS = ['Operations', 'HR', 'Finance', 'Administration', 'Technical'];

const INITIAL_PERMISSIONS = {
    canViewPayments: false,
    canVerifyPayments: false,
    canManageTenants: false,
    canManageTechnicians: false,
    canManageContracts: false,
    canViewFinancials: false,
    canEditPricing: false,
    canManageCompanyProfile: false,
    canDispatchJobs: false,
    canViewAuditLogs: false,
    canExportReports: false,
    canManageStaff: false,
};

interface RegisterStaffDialogProps {
    open: boolean;
    onClose: () => void;
}

export default function RegisterStaffDialog({ open, onClose }: RegisterStaffDialogProps) {
    const { user: currentUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
        role: 'technician',
        department: 'Technical',
        salary: '',
        workingHours: '9 AM - 4 PM',
        emirate: 'Dubai',
        joiningDate: new Date().toISOString().split('T')[0],
        offDay: 'Sunday',
        leaveBalance: '30',
        visaExpiry: '',
        emiratesIdExpiry: '',
        passportExpiry: '',
        medicalExpiry: '',
        drivingLicenseExpiry: '',
        basicSalary: '',
        allowances: '',
        supervisorName: '',
        shiftName: 'Day Shift'
    });

    const [permissions, setPermissions] = useState<Record<string, boolean>>(INITIAL_PERMISSIONS);

    const handleInputChange = (e: any) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name as string]: value }));
    };

    const handlePermissionChange = (key: string) => {
        setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSubmit = async () => {
        if (!formData.fullName || !formData.email || !formData.role) {
            setError('Please fill in all required fields.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // 1. Write to 'users' collection
            const userRef = await addDoc(collection(db, 'users'), {
                displayName: formData.fullName,
                fullName: formData.fullName,
                email: formData.email.toLowerCase().trim(),
                phone: formData.phone,
                role: formData.role,
                department: formData.department,
                emirate: formData.emirate,
                status: 'ACTIVE',
                isStaff: true,
                onboardingComplete: true,
                permissions: permissions,
                offDay: formData.offDay,
                leaveBalance: parseFloat(formData.leaveBalance) || 0,
                visaExpiry: formData.visaExpiry,
                emiratesIdExpiry: formData.emiratesIdExpiry,
                passportExpiry: formData.passportExpiry,
                medicalExpiry: formData.medicalExpiry,
                drivingLicenseExpiry: formData.drivingLicenseExpiry,
                basicSalary: parseFloat(formData.basicSalary) || 0,
                allowances: parseFloat(formData.allowances) || 0,
                salary: (parseFloat(formData.basicSalary) || 0) + (parseFloat(formData.allowances) || 0),
                supervisorName: formData.supervisorName,
                shiftName: formData.shiftName,
                workingHours: formData.workingHours,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: currentUser?.uid
            });

            const staffUid = userRef.id;

            // 2. Write to 'staffAccess'
            await setDoc(doc(db, 'staffAccess', staffUid), {
                uid: staffUid,
                role: formData.role,
                permissions: permissions,
                active: true,
                grantedAt: serverTimestamp(),
                grantedBy: currentUser?.uid
            });

            // 3. Write to 'permissions' (dedicated collection as requested)
            await setDoc(doc(db, 'permissions', staffUid), {
                uid: staffUid,
                ...permissions,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser?.uid
            });

            // 4. Write to 'hrProfiles'
            await setDoc(doc(db, 'hrProfiles', staffUid), {
                uid: staffUid,
                fullName: formData.fullName,
                email: formData.email,
                phone: formData.phone,
                role: formData.role,
                department: formData.department,
                basicSalary: parseFloat(formData.basicSalary) || 0,
                allowances: parseFloat(formData.allowances) || 0,
                salary: (parseFloat(formData.basicSalary) || 0) + (parseFloat(formData.allowances) || 0),
                workingHours: formData.workingHours,
                emirate: formData.emirate,
                joiningDate: formData.joiningDate,
                offDay: formData.offDay,
                leaveBalance: parseFloat(formData.leaveBalance) || 0,
                visaExpiry: formData.visaExpiry,
                emiratesIdExpiry: formData.emiratesIdExpiry,
                passportExpiry: formData.passportExpiry,
                medicalExpiry: formData.medicalExpiry,
                drivingLicenseExpiry: formData.drivingLicenseExpiry,
                supervisorName: formData.supervisorName,
                shiftName: formData.shiftName,
                status: 'ACTIVE',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // 4B. Write to 'technicians' collection if technician
            if (formData.role === 'technician') {
                await setDoc(doc(db, 'technicians', staffUid), {
                    uid: staffUid,
                    fullName: formData.fullName,
                    displayName: formData.fullName,
                    email: formData.email.toLowerCase().trim(),
                    phone: formData.phone,
                    role: formData.role,
                    trade: formData.department === 'Technical' ? 'General Maintenance' : formData.department,
                    specialization: formData.department === 'Technical' ? 'General Maintenance' : formData.department,
                    emirate: formData.emirate,
                    shiftName: formData.shiftName,
                    offDay: formData.offDay,
                    supervisorName: formData.supervisorName,
                    visaExpiry: formData.visaExpiry,
                    emiratesIdExpiry: formData.emiratesIdExpiry,
                    passportExpiry: formData.passportExpiry,
                    medicalExpiry: formData.medicalExpiry,
                    drivingLicenseExpiry: formData.drivingLicenseExpiry,
                    basicSalary: parseFloat(formData.basicSalary) || 0,
                    salary: (parseFloat(formData.basicSalary) || 0) + (parseFloat(formData.allowances) || 0),
                    leaveBalance: parseFloat(formData.leaveBalance) || 0,
                    status: 'ACTIVE',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }

            // 5. Write to 'auditLogs'
            await addDoc(collection(db, 'auditLogs'), {
                action: 'STAFF_REGISTERED',
                actorId: currentUser?.uid,
                actorName: currentUser?.displayName || 'Admin',
                targetId: staffUid,
                targetName: formData.fullName,
                details: `Registered new staff member with role ${formData.role}`,
                timestamp: serverTimestamp()
            });

            setSuccess(true);
            setTimeout(() => {
                onClose();
                setSuccess(false);
                setFormData({
                    fullName: '',
                    email: '',
                    phone: '',
                    role: 'technician',
                    department: 'Technical',
                    salary: '',
                    workingHours: '9 AM - 4 PM',
                    emirate: 'Dubai',
                    joiningDate: new Date().toISOString().split('T')[0],
                    offDay: 'Sunday',
                    leaveBalance: '30',
                    visaExpiry: '',
                    emiratesIdExpiry: '',
                    passportExpiry: '',
                    medicalExpiry: '',
                    drivingLicenseExpiry: '',
                    basicSalary: '',
                    allowances: '',
                    supervisorName: '',
                    shiftName: 'Day Shift'
                });
                setPermissions(INITIAL_PERMISSIONS);
            }, 2000);

        } catch (err: any) {
            console.error('Staff registration error:', err);
            setError(err.message || 'Failed to register staff.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: '#0f172a', color: '#fff', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}>
            <DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 2 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <UserPlus color="#C6A75E" />
                    <Typography variant="h5" fontWeight="950">REGISTER NEW STAFF</Typography>
                </Stack>
            </DialogTitle>

            <DialogContent sx={{ mt: 2 }}>
                {success && <Alert severity="success" sx={{ mb: 3 }}>Staff member registered successfully!</Alert>}
                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Full Name" name="fullName" value={formData.fullName} onChange={handleInputChange}
                            variant="outlined" required sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Email Address" name="email" type="email" value={formData.email} onChange={handleInputChange}
                            variant="outlined" required sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Phone Number" name="phone" value={formData.phone} onChange={handleInputChange}
                            variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Role</InputLabel>
                            <Select name="role" value={formData.role} onChange={handleInputChange} label="Role" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                                {STAFF_ROLES.map(role => <MenuItem key={role.value} value={role.value}>{role.label}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Department</InputLabel>
                            <Select name="department" value={formData.department} onChange={handleInputChange} label="Department" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>
                                {DEPARTMENTS.map(dept => <MenuItem key={dept} value={dept}>{dept}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Monthly Salary (AED)" name="salary" type="number" value={formData.salary} onChange={handleInputChange}
                            variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                            InputProps={{ startAdornment: <DollarSign size={16} style={{ marginRight: 8, color: 'rgba(255,255,255,0.3)' }} /> }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Working Hours" name="workingHours" value={formData.workingHours} onChange={handleInputChange}
                            variant="outlined" placeholder="e.g. 9 AM - 4 PM" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Emirate / Zone" name="emirate" value={formData.emirate} onChange={handleInputChange}
                            variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                            InputProps={{ startAdornment: <MapPin size={16} style={{ marginRight: 8, color: 'rgba(255,255,255,0.3)' }} /> }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Joining Date" name="joiningDate" type="date" value={formData.joiningDate} onChange={handleInputChange}
                            variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Off Day" name="offDay" value={formData.offDay} onChange={handleInputChange}
                            variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Leave Balance (Days)" name="leaveBalance" type="number" value={formData.leaveBalance} onChange={handleInputChange}
                            variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Visa Expiry" name="visaExpiry" type="date" value={formData.visaExpiry} onChange={handleInputChange}
                            variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Emirates ID Expiry" name="emiratesIdExpiry" type="date" value={formData.emiratesIdExpiry} onChange={handleInputChange}
                            variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Passport Expiry" name="passportExpiry" type="date" value={formData.passportExpiry} onChange={handleInputChange}
                            variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Medical Expiry" name="medicalExpiry" type="date" value={formData.medicalExpiry} onChange={handleInputChange}
                            variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Driving License Expiry" name="drivingLicenseExpiry" type="date" value={formData.drivingLicenseExpiry} onChange={handleInputChange}
                            variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Basic Salary (AED)" name="basicSalary" type="number" value={formData.basicSalary} onChange={handleInputChange}
                            variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Allowances (AED)" name="allowances" type="number" value={formData.allowances} onChange={handleInputChange}
                            variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Supervisor Name" name="supervisorName" value={formData.supervisorName} onChange={handleInputChange}
                            variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Shift Name" name="shiftName" value={formData.shiftName} onChange={handleInputChange}
                            variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <Divider sx={{ my: 2, bgcolor: 'rgba(255,255,255,0.1)' }} />
                        <Typography variant="overline" sx={{ color: '#C6A75E', fontWeight: 900, mb: 2, display: 'block' }}>GRANULAR PERMISSIONS</Typography>
                        <Grid container spacing={1}>
                            {Object.keys(permissions).map((key) => (
                                <Grid item xs={12} sm={6} md={4} key={key}>
                                    <FormControlLabel
                                        control={<Checkbox checked={permissions[key]} onChange={() => handlePermissionChange(key)} sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#C6A75E' } }} />}
                                        label={<Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>{key.replace(/([A-Z])/g, ' $1').replace(/^can /, '').toUpperCase()}</Typography>}
                                    />
                                </Grid>
                            ))}
                        </Grid>
                    </Grid>
                </Grid>
            </DialogContent>

            <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CANCEL</Button>
                <Button 
                    variant="contained" 
                    onClick={handleSubmit} 
                    disabled={loading || success}
                    sx={{ bgcolor: '#C6A75E', color: '#000', fontWeight: 950, px: 4, '&:hover': { bgcolor: '#b59410' } }}
                >
                    {loading ? <CircularProgress size={24} sx={{ color: '#000' }} /> : 'REGISTER STAFF'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
