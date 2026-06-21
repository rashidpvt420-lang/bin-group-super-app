import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Box,
  Typography,
  Alert,
  IconButton,
  Divider,
  Stack,
  Checkbox,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select
} from '@mui/material';
import { X, UserPlus, Shield, Smartphone, Mail, Briefcase } from 'lucide-react';
import { binThemeTokens } from '../theme/adminTheme';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

interface RegisterStaffDialogProps {
    open: boolean;
    onClose: () => void;
}

const ROLES = [
    { value: 'technician', label: 'Field Technician' },
    { value: 'hr_staff', label: 'HR Administrator' },
    { value: 'manager', label: 'Operations Manager' },
    { value: 'admin', label: 'System Admin' }
];

export default function RegisterStaffDialog({ open, onClose }: RegisterStaffDialogProps) {
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        mobile: '',
        role: 'technician',
        employeeId: '',
        emiratesId: '',
        department: '',
        initialPassword: 'BinGroupPass2026!',
        monthlySalary: '',
        basicSalary: '',
        housingAllowance: '',
        transportAllowance: '',
        foodAllowance: '',
        otherAllowance: '',
        salaryPaymentDay: '1',
        salaryGrade: '',
        contractEndDate: '',
        employmentType: 'full_time',
        overtimeEligible: true,
        companyAccommodationProvided: false,
        companyTransportProvided: false,
        companyMedicalInsuranceProvided: true,
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const moneyValue = (value: any) => {
        const parsed = parseFloat(String(value || '0').replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        if (e) e.preventDefault();
        setError(null);

        try {
            const registerFn = httpsCallable(functions, 'adminCreateUser');
            
            const housing = moneyValue(formData.housingAllowance);
            const transport = moneyValue(formData.transportAllowance);
            const food = moneyValue(formData.foodAllowance);
            const other = moneyValue(formData.otherAllowance);
            
            const allowances = housing + transport + food + other;
            const basicSalary = moneyValue(formData.basicSalary);
            const monthlySalary = moneyValue(formData.monthlySalary);
            
            let finalBasic = basicSalary;
            let finalAllowances = allowances;
            
            if (monthlySalary > 0 && finalBasic <= 0 && finalAllowances <= 0) {
                finalBasic = Math.round(monthlySalary * 0.60);
                finalAllowances = monthlySalary - finalBasic;
            } else if (monthlySalary > 0 && finalBasic > 0 && finalAllowances <= 0) {
                finalAllowances = Math.max(monthlySalary - finalBasic, 0);
            } else if (monthlySalary > 0 && finalBasic <= 0 && finalAllowances > 0) {
                finalBasic = Math.max(monthlySalary - finalAllowances, 0);
            }

            const response = await registerFn({
                email: formData.email,
                displayName: formData.fullName,
                fullName: formData.fullName,
                phoneNumber: formData.mobile,
                phone: formData.mobile,
                role: formData.role,
                employeeId: formData.employeeId,
                emiratesId: formData.emiratesId,
                department: formData.department,
                initialPassword: formData.initialPassword,
                basicSalary: finalBasic,
                allowances: finalAllowances,
                housingAllowance: housing,
                transportAllowance: transport,
                foodAllowance: food,
                otherAllowance: other,
                salaryPaymentDay: formData.salaryPaymentDay,
                salaryGrade: formData.salaryGrade,
                contractEndDate: formData.contractEndDate || null,
                employmentType: formData.employmentType,
                overtimeEligible: formData.overtimeEligible,
                companyAccommodationProvided: formData.companyAccommodationProvided,
                companyTransportProvided: formData.companyTransportProvided,
                companyMedicalInsuranceProvided: formData.companyMedicalInsuranceProvided,
            });

            const result = response.data as any;
            if (result?.success) {
                setSuccess(true);
                setTimeout(() => {
                    onClose();
                    setSuccess(false);
                    setFormData({
                        fullName: '',
                        email: '',
                        mobile: '',
                        role: 'technician',
                        employeeId: '',
                        emiratesId: '',
                        department: '',
                        initialPassword: 'BinGroupPass2026!',
                        monthlySalary: '',
                        basicSalary: '',
                        housingAllowance: '',
                        transportAllowance: '',
                        foodAllowance: '',
                        otherAllowance: '',
                        salaryPaymentDay: '1',
                        salaryGrade: '',
                        contractEndDate: '',
                        employmentType: 'full_time',
                        overtimeEligible: true,
                        companyAccommodationProvided: false,
                        companyTransportProvided: false,
                        companyMedicalInsuranceProvided: true,
                    });
                }, 2500);
            } else {
                throw new Error(result?.message || 'Failed to create user account.');
            }
        } catch (err: any) {
            console.error('[HR] Registration failed:', err);
            setError(err.message || 'Failed to submit registration request.');
        }
    };

    return (
        <Dialog 
            open={open} 
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: '#111',
                    backgroundImage: 'linear-gradient(rgba(255,255,255,0.05), rgba(255,255,255,0))',
                    border: '1px solid rgba(198,167,94,0.2)',
                    borderRadius: 3
                }
            }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <UserPlus color={binThemeTokens.gold} size={24} />
                    <Typography variant="h6" fontWeight="900" sx={{ color: '#fff', letterSpacing: 1 }}>
                        REGISTER NEW <Typography component="span" variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>STAFF</Typography>
                    </Typography>
                </Box>
                <IconButton onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    <X size={20} />
                </IconButton>
            </DialogTitle>

            <DialogContent dividers sx={{ borderColor: 'rgba(198,167,94,0.1)', p: 3 }}>
                <Alert severity="warning" sx={{ mb: 3, bgcolor: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid #d97706', fontWeight: 700 }}>
                    Staff account creation requires manual Firebase Auth setup until backend provisioning is enabled.
                </Alert>
                {success ? (
                    <Alert severity="success" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid #10b981', fontWeight: 700 }}>
                        Staff member registered and provisioned successfully!
                    </Alert>
                ) : (
                    <Box component="form" onSubmit={handleSubmit}>
                        <Grid container spacing={2.5}>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Full Name"
                                    name="fullName"
                                    value={formData.fullName}
                                    onChange={handleChange}
                                    required
                                    variant="outlined"
                                    InputProps={{ startAdornment: <Shield size={18} style={{ marginRight: 12, opacity: 0.5, color: '#fff' }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Email Address"
                                    name="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    InputProps={{ startAdornment: <Mail size={18} style={{ marginRight: 12, opacity: 0.5, color: '#fff' }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Mobile Number"
                                    name="mobile"
                                    value={formData.mobile}
                                    onChange={handleChange}
                                    required
                                    InputProps={{ startAdornment: <Smartphone size={18} style={{ marginRight: 12, opacity: 0.5, color: '#fff' }} /> }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    select
                                    label="Assigned Role"
                                    name="role"
                                    value={formData.role}
                                    onChange={handleChange}
                                    required
                                    InputProps={{ startAdornment: <Briefcase size={18} style={{ marginRight: 12, opacity: 0.5, color: '#fff' }} /> }}
                                >
                                    {ROLES.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>
                                            {option.label}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Employee ID"
                                    name="employeeId"
                                    value={formData.employeeId}
                                    onChange={handleChange}
                                    required
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Emirates ID"
                                    name="emiratesId"
                                    value={formData.emiratesId}
                                    onChange={handleChange}
                                    required
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Department"
                                    name="department"
                                    value={formData.department}
                                    onChange={handleChange}
                                    placeholder="e.g. Facilities Management"
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Initial Password"
                                    name="initialPassword"
                                    value={formData.initialPassword}
                                    onChange={handleChange}
                                    required
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <Divider sx={{ my: 1, bgcolor: 'rgba(255,255,255,0.1)' }} />
                                <Typography variant="overline" sx={{ color: '#C6A75E', fontWeight: 900, mb: 1, display: 'block' }}>
                                    SALARY PACKAGE / CONTRACT DETAILS
                                </Typography>
                            </Grid>

                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Monthly Salary (AED)"
                                    name="monthlySalary"
                                    type="number"
                                    value={formData.monthlySalary}
                                    onChange={handleChange}
                                    variant="outlined"
                                    sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Basic Salary (AED)"
                                    name="basicSalary"
                                    type="number"
                                    value={formData.basicSalary}
                                    onChange={handleChange}
                                    variant="outlined"
                                    sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Housing Allowance (AED)"
                                    name="housingAllowance"
                                    type="number"
                                    value={formData.housingAllowance}
                                    onChange={handleChange}
                                    variant="outlined"
                                    sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Transport Allowance (AED)"
                                    name="transportAllowance"
                                    type="number"
                                    value={formData.transportAllowance}
                                    onChange={handleChange}
                                    variant="outlined"
                                    sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Food Allowance (AED)"
                                    name="foodAllowance"
                                    type="number"
                                    value={formData.foodAllowance}
                                    onChange={handleChange}
                                    variant="outlined"
                                    sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Other Allowance (AED)"
                                    name="otherAllowance"
                                    type="number"
                                    value={formData.otherAllowance}
                                    onChange={handleChange}
                                    variant="outlined"
                                    sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Salary Payment Day"
                                    name="salaryPaymentDay"
                                    type="number"
                                    value={formData.salaryPaymentDay}
                                    onChange={handleChange}
                                    variant="outlined"
                                    sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Salary Grade"
                                    name="salaryGrade"
                                    value={formData.salaryGrade}
                                    onChange={handleChange}
                                    variant="outlined"
                                    sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Contract End Date"
                                    name="contractEndDate"
                                    type="date"
                                    value={formData.contractEndDate}
                                    onChange={handleChange}
                                    variant="outlined"
                                    InputLabelProps={{ shrink: true }}
                                    sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth variant="outlined">
                                    <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Employment Type</InputLabel>
                                    <Select
                                        name="employmentType"
                                        value={formData.employmentType}
                                        onChange={(event) => setFormData(prev => ({ ...prev, employmentType: event.target.value } as any))}
                                        label="Employment Type"
                                        sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                                    >
                                        <MenuItem value="full_time">Full Time</MenuItem>
                                        <MenuItem value="part_time">Part Time</MenuItem>
                                        <MenuItem value="fixed_term">Fixed Term</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>

                            <Grid item xs={12}>
                                <Stack direction="row" spacing={2} flexWrap="wrap">
                                    <FormControlLabel
                                        control={<Checkbox checked={formData.overtimeEligible} onChange={(e) => setFormData(prev => ({ ...prev, overtimeEligible: e.target.checked } as any))} sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#C6A75E' } }} />}
                                        label={<Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>OVERTIME ELIGIBLE</Typography>}
                                    />
                                    <FormControlLabel
                                        control={<Checkbox checked={formData.companyAccommodationProvided} onChange={(e) => setFormData(prev => ({ ...prev, companyAccommodationProvided: e.target.checked } as any))} sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#C6A75E' } }} />}
                                        label={<Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>COMPANY ACCOMMODATION</Typography>}
                                    />
                                    <FormControlLabel
                                        control={<Checkbox checked={formData.companyTransportProvided} onChange={(e) => setFormData(prev => ({ ...prev, companyTransportProvided: e.target.checked } as any))} sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#C6A75E' } }} />}
                                        label={<Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>COMPANY TRANSPORT</Typography>}
                                    />
                                    <FormControlLabel
                                        control={<Checkbox checked={formData.companyMedicalInsuranceProvided} onChange={(e) => setFormData(prev => ({ ...prev, companyMedicalInsuranceProvided: e.target.checked } as any))} sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#C6A75E' } }} />}
                                        label={<Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>MEDICAL INSURANCE</Typography>}
                                    />
                                </Stack>
                            </Grid>
                        </Grid>

                        {error && (
                            <Alert severity="error" sx={{ mt: 3, bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid #ef4444' }}>
                                {error}
                            </Alert>
                        )}
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 3, bgcolor: 'rgba(0,0,0,0.2)' }}>
                <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
                    Cancel
                </Button>
                <Button 
                    variant="contained" 
                    onClick={handleSubmit}
                    disabled={true}
                    sx={{ 
                        bgcolor: '#334155', 
                        color: '#94a3b8', 
                        fontWeight: 900,
                        minWidth: 140,
                        cursor: 'not-allowed'
                    }}
                >
                    MANUAL SETUP REQUIRED
                </Button>
            </DialogActions>
        </Dialog>
    );
}
