import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, Stack, Button, CircularProgress,
    Chip, Divider, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, FormControl, InputLabel, Select, MenuItem, Alert
} from '@mui/material';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { db, doc, getDoc, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, onSnapshot, updateDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import {
    Calendar, Clock, User, DollarSign, FileText,
    AlertTriangle, Plus, Send, Landmark, ShieldCheck, CreditCard
} from 'lucide-react';

export default function TechnicianHRPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
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

    const classifyPeopleAi = (message: string) => {
        const text = message.toLowerCase();
        if (['accident','injury','unsafe','emergency','danger'].some(k => text.includes(k))) return { category: 'safety', requestType: 'safety_incident', priority: 'urgent', answer: 'Urgent safety case created for HR and Operations review.' };
        if (['salary','wages','payslip','payment','deduction'].some(k => text.includes(k))) return { category: 'payroll', requestType: text.includes('payslip') ? 'payslip' : 'salary_query', priority: 'high', answer: 'Payroll review case created. HR or Finance will reply inside the app.' };
        if (['overtime','extra hour','late night','worked late','rest day'].some(k => text.includes(k))) return { category: 'overtime', requestType: 'overtime', priority: 'high', answer: 'Overtime review case created.' };
        if (['leave','vacation','sick','medical','doctor','hospital'].some(k => text.includes(k))) return { category: 'leave', requestType: text.includes('sick') || text.includes('medical') || text.includes('hospital') ? 'sick_leave' : 'annual_leave', priority: 'normal', answer: 'Leave support case created.' };
        if (['visa','emirates id','passport','document','contract copy'].some(k => text.includes(k))) return { category: 'documents', requestType: 'document_update', priority: 'normal', answer: 'Document support case created.' };
        if (['accommodation','room','camp','bed','water','toilet','a/c'].some(k => text.includes(k))) return { category: 'accommodation', requestType: 'accommodation', priority: 'high', answer: 'Accommodation support case created.' };
        if (['tool','tools','helmet','gloves','ppe','uniform','drill','ladder'].some(k => text.includes(k))) return { category: 'tools_ppe', requestType: 'tools_ppe', priority: 'normal', answer: 'Tools/PPE case created.' };
        if (['supervisor','manager','unfair','pressure','complaint'].some(k => text.includes(k))) return { category: 'manager_issue', requestType: 'manager_issue', priority: 'urgent', answer: 'Confidential HR review case created.' };
        return { category: 'general_hr', requestType: 'hr_support', priority: 'normal', answer: 'General HR support case created.' };
    };

    const handleAcceptAgreement = async () => {
        if (!user?.uid) return;
        await updateDoc(doc(db, 'staffAgreements', user.uid), { status: 'accepted', acceptedAt: serverTimestamp(), acceptedBy: user.uid, acceptanceMethod: 'technician_portal', updatedAt: serverTimestamp() });
        await addDoc(collection(db, 'auditLogs'), { action: 'STAFF_AGREEMENT_ACCEPTED', actorId: user.uid, actorName: user.displayName || profile?.displayName || profile?.fullName || 'Technician', targetId: user.uid, details: 'Accepted BIN People AI staff agreement.', timestamp: serverTimestamp() });
    };

    const handlePeopleAiSubmit = async () => {
        if (!user?.uid || !aiQuestion.trim()) return;
        setAiSubmitting(true);
        try {
            const result = classifyPeopleAi(aiQuestion);
            const identity = { uid: user.uid, technicianId: user.uid, displayName: user.displayName || profile?.displayName || profile?.fullName || 'Technician', email: user.email || profile?.email || '', role: user.role || profile?.role || 'technician' };
            await addDoc(collection(db, 'hrAiConversations'), { ...identity, question: aiQuestion.trim(), category: result.category, requestType: result.requestType, priority: result.priority, answer: result.answer, source: 'technician_people_ai', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            await addDoc(collection(db, 'staffRequests'), { ...identity, requestType: result.requestType, category: result.category, priority: result.priority, startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0], hours: 0, reason: aiQuestion.trim(), aiAnswer: result.answer, status: 'pending_hr_review', source: 'bin_people_ai', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            setAiAnswer(result.answer);
            setAiQuestion('');
            await loadHRData();
        } finally { setAiSubmitting(false); }
    };

    const handleMoodCheckin = async (mood: string) => {
        if (!user?.uid) return;
        setMoodSubmitting(true);
        try {
            const riskScore = mood === 'urgent' ? 100 : mood === 'angry' ? 85 : mood === 'stressed' ? 70 : mood === 'sick' ? 65 : mood === 'okay' ? 35 : 10;
            const identity = { uid: user.uid, technicianId: user.uid, displayName: user.displayName || profile?.displayName || profile?.fullName || 'Technician', email: user.email || profile?.email || '', role: user.role || profile?.role || 'technician' };
            await addDoc(collection(db, 'staffMoodCheckins'), { ...identity, mood, riskScore, source: 'technician_portal', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            if (riskScore >= 70) await addDoc(collection(db, 'staffRequests'), { ...identity, requestType: 'staff_wellbeing', category: 'wellbeing', priority: riskScore >= 85 ? 'urgent' : 'high', reason: `Mood check-in risk detected: ${mood}`, status: 'pending_hr_review', source: 'mood_checkin', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        } finally { setMoodSubmitting(false); }
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
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 955, letterSpacing: 4 }}>
                        {t('dash.tech.operator_command') || 'OPERATOR COMMAND'}
                    </Typography>
                    <Typography variant="h3" fontWeight="950" color="#FFF">
                        {t('dash.tech.hr_title') || 'HR Self-Service'}
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<Plus size={18} />}
                    onClick={handleOpenDialog}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                >
                    {t('dash.tech.new_request') || 'NEW REQUEST'}
                </Button>
            </Box>

            {/* Document Warning HUD */}
            {alerts.length > 0 && (
                <Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.22)', borderRadius: 5, textAlign: isRTL ? 'right' : 'left' }}>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                        <AlertTriangle color="#ef4444" size={24} />
                        <Typography variant="subtitle1" fontWeight="955" color="#FFF">
                            {t('dash.tech.compliance_alerts') || 'DOCUMENT COMPLIANCE ALERTS'}
                        </Typography>
                    </Stack>
                    <Grid container spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        {alerts.map((alert, idx) => (
                            <Grid item xs={12} sm={6} key={idx}>
                                {alert.type === 'expired' ? (
                                    <Alert severity="error" variant="outlined" sx={{ color: '#fecaca', borderColor: 'rgba(239,68,68,0.5)', bgcolor: 'transparent', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <strong>{alert.name}</strong> {t('dash.tech.expired_desc') || 'has expired! Immediate renewal required.'}
                                    </Alert>
                                ) : alert.type === 'critical' ? (
                                    <Alert severity="warning" variant="outlined" sx={{ color: '#fef08a', borderColor: 'rgba(234,179,8,0.5)', bgcolor: 'transparent', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <strong>{alert.name}</strong> {t('dash.tech.expires_desc', { days: alert.days }) || `expires in ${alert.days} days. Please submit a renewal update.`}
                                    </Alert>
                                ) : (
                                    <Alert severity="info" variant="outlined" sx={{ color: '#93c5fd', borderColor: 'rgba(59,130,246,0.5)', bgcolor: 'transparent', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <strong>{alert.name}</strong> {t('dash.tech.missing_desc') || 'record is missing. Please contact HR.'}
                                    </Alert>
                                )}
                            </Grid>
                        ))}
                    </Grid>
                </Paper>
            )}

            {/* Main Sections */}
            <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                {/* Roster & Schedule Card */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mb: 3 }}>
                            <Calendar color={binThemeTokens.gold} />
                            <Typography variant="h6" fontWeight="950" color="#FFF">
                                {t('dash.tech.shift_attendance') || 'Shift & Attendance'}
                            </Typography>
                        </Stack>
                        <Stack spacing={2}>
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                                    {t('dash.tech.shift_name') || 'SHIFT NAME'}
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>{shift}</Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                                    {t('dash.tech.weekly_off') || 'WEEKLY OFF'}
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>{offDay}</Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                                    {t('dash.tech.todays_status') || "TODAY'S STATUS"}
                                </Typography>
                                <Chip label={dutyStatus} size="small" sx={{ bgcolor: dutyStatus === 'WORKING' ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', color: dutyStatus === 'WORKING' ? '#10b981' : '#94a3b8', fontWeight: 950 }} />
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                                    {t('dash.tech.supervisor') || 'SUPERVISOR'}
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>{supervisor}</Typography>
                            </Stack>
                        </Stack>
                    </Paper>
                </Grid>

                {/* Leaves & Payroll Card */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mb: 3 }}>
                            <DollarSign color={binThemeTokens.gold} />
                            <Typography variant="h6" fontWeight="950" color="#FFF">
                                {t('dash.tech.payroll_leaves') || 'Payroll & Leaves'}
                            </Typography>
                        </Stack>
                        <Stack spacing={2}>
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                                    {t('dash.tech.annual_leave_balance') || 'ANNUAL LEAVE BALANCE'}
                                </Typography>
                                <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{leaveBalance} Days</Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                                    {t('dash.tech.basic_salary') || 'BASIC SALARY'}
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>
                                    {profile?.basicSalary ? `AED ${profile.basicSalary.toLocaleString()}` : 'AED 12,000'}
                                </Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                                    {t('dash.tech.allowances') || 'ALLOWANCES'}
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>
                                    {profile?.allowances ? `AED ${profile.allowances.toLocaleString()}` : 'AED 3,000'}
                                </Typography>
                            </Stack>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between">
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                                    {t('dash.tech.payroll_status') || 'PAYROLL STATUS'}
                                </Typography>
                                <Chip label="ACTIVE" size="small" color="success" sx={{ fontWeight: 950 }} />
                            </Stack>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>

            {/* Document Expiries Panel */}
            <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mb: 4 }}>
                    <FileText color={binThemeTokens.gold} />
                    <Typography variant="h6" fontWeight="950" color="#FFF">
                        {t('dash.tech.compliance_dossier') || 'Sovereign Compliance Dossier'}
                    </Typography>
                </Stack>
                <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Grid item xs={12} sm={4} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>
                                {t('dash.tech.residency_visa') || 'RESIDENCY VISA'}
                            </Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mt: 1 }}>{profile?.visaExpiry || 'Pending sync'}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={4} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>
                                {t('dash.tech.emirates_id') || 'EMIRATES ID'}
                            </Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mt: 1 }}>{profile?.emiratesIdExpiry || 'Pending sync'}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={4} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>
                                {t('dash.tech.passport') || 'PASSPORT'}
                            </Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mt: 1 }}>{profile?.passportExpiry || 'Pending sync'}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>
                                {t('dash.tech.medical_card') || 'HEALTH INSURANCE MEDICAL CARD'}
                            </Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mt: 1 }}>{profile?.medicalExpiry || 'Pending sync'}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>
                                {t('dash.tech.driving_license') || 'DRIVING LICENSE'}
                            </Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mt: 1 }}>{profile?.drivingLicenseExpiry || 'Pending sync'}</Typography>
                        </Paper>
                    </Grid>
                </Grid>
            </Paper>

            {/* Request Logs History */}
            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 3 }}>
                    {t('dash.tech.request_registry') || 'HR Request Registry'}
                </Typography>
                {requests.length === 0 ? (
                    <Typography variant="body2" color="rgba(255,255,255,0.4)">
                        {t('dash.tech.no_requests') || 'No requests submitted yet.'}
                    </Typography>
                ) : (
                    <Stack spacing={2}>
                        {requests.map((req) => (
                            <Paper key={req.id} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                                <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                                    <Box sx={{ width: '100%' }}>
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
                                            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, borderLeft: isRTL ? 'none' : `2px solid ${binThemeTokens.gold}`, borderRight: isRTL ? `2px solid ${binThemeTokens.gold}` : 'none' }}>
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
                PaperProps={{ sx: { bgcolor: '#0f172a', color: '#fff', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', direction: isRTL ? 'rtl' : 'ltr' } }}
            >
                <DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 2 }}>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ justifyContent: 'flex-start' }}>
                        <Plus color={binThemeTokens.gold} />
                        <Typography variant="h6" fontWeight="955">
                            {t('dash.tech.submit_request') || 'SUBMIT STAFF REQUEST'}
                        </Typography>
                    </Stack>
                </DialogTitle>
                <DialogContent sx={{ mt: 2, textAlign: isRTL ? 'right' : 'left' }}>
                    {dialogSuccess && <Alert severity="success" sx={{ mb: 3 }}>Request submitted to HR registry.</Alert>}
                    {dialogError && <Alert severity="error" sx={{ mb: 3 }}>{dialogError}</Alert>}

                    <Stack spacing={3}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={{ color: 'rgba(255,255,255,0.5)', right: isRTL ? 24 : 'auto', left: isRTL ? 'auto' : 0 }}>
                                {t('dash.tech.request_type') || 'Request Type'}
                            </InputLabel>
                            <Select 
                                name="requestType" 
                                value={requestForm.requestType} 
                                onChange={handleFormChange} 
                                label={t('dash.tech.request_type') || 'Request Type'}
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
                            <Grid container spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Grid item xs={6}>
                                    <TextField
                                        fullWidth label={t('dash.tech.start_date') || 'Start Date'} name="startDate" type="date" value={requestForm.startDate} onChange={handleFormChange}
                                        variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)', right: isRTL ? 24 : 'auto', left: isRTL ? 'auto' : 0 } }}
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        fullWidth label={t('dash.tech.end_date') || 'End Date'} name="endDate" type="date" value={requestForm.endDate} onChange={handleFormChange}
                                        variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)', right: isRTL ? 24 : 'auto', left: isRTL ? 'auto' : 0 } }}
                                    />
                                </Grid>
                            </Grid>
                        )}

                        {requestForm.requestType === 'overtime' && (
                            <TextField
                                fullWidth label={t('dash.tech.overtime_hours') || 'Overtime Hours Claimed'} name="hours" type="number" value={requestForm.hours} onChange={handleFormChange}
                                variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)', right: isRTL ? 24 : 'auto', left: isRTL ? 'auto' : 0 } }}
                            />
                        )}

                        <TextField
                            fullWidth label={t('dash.tech.reason_notes') || 'Reason / Detailed Notes'} name="reason" multiline rows={4} value={requestForm.reason} onChange={handleFormChange}
                            variant="outlined" required placeholder="Provide full justification for your request..." sx={{ textarea: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)', right: isRTL ? 24 : 'auto', left: isRTL ? 'auto' : 0 } }}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.1)', justifyContent: 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Button onClick={() => setDialogOpen(false)} disabled={submitting} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>
                        {t('btn.cancel') || 'CANCEL'}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleRequestSubmit}
                        disabled={submitting || dialogSuccess}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4 }}
                    >
                        {submitting ? <CircularProgress size={24} sx={{ color: '#000' }} /> : (t('btn.submit') || 'SUBMIT')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
