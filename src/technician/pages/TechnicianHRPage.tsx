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

const STAFF_REQUEST_TYPES = [
    ['annual_leave', 'Annual Leave'],
    ['emergency_leave', 'Emergency Leave'],
    ['sick_leave', 'Sick Leave / Medical'],
    ['unpaid_leave', 'Unpaid Leave'],
    ['overtime', 'Overtime / Rest-Day Work'],
    ['payslip', 'Payslip Request'],
    ['salary_query', 'Salary / Deduction Query'],
    ['salary_certificate', 'Salary Certificate'],
    ['noc_letter', 'NOC Letter'],
    ['experience_letter', 'Experience Letter'],
    ['contract_copy', 'Contract Copy'],
    ['document_update', 'Visa / EID / Passport Update'],
    ['tools_ppe', 'Tools / PPE / Uniform Request'],
    ['vehicle_issue', 'Vehicle / Transport Issue'],
    ['accommodation', 'Accommodation / Camp Issue'],
    ['safety_incident', 'Safety Incident Report'],
    ['manager_issue', 'Private HR Complaint'],
    ['staff_wellbeing', 'Staff Wellbeing Support'],
    ['hr_support', 'HR Support / General Request'],
];

export default function TechnicianHRPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [requests, setRequests] = useState<any[]>([]);
    const [agreement, setAgreement] = useState<any>(null);
    const [aiQuestion, setAiQuestion] = useState('');
    const [aiAnswer, setAiAnswer] = useState('');
    const [aiSubmitting, setAiSubmitting] = useState(false);
    const [moodSubmitting, setMoodSubmitting] = useState(false);
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
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            const techSnap = await getDoc(doc(db, 'technicians', user.uid));
            const hrSnap = await getDoc(doc(db, 'hrProfiles', user.uid));
            const agreementSnap = await getDoc(doc(db, 'staffAgreements', user.uid));
            const merged = {
                ...(userSnap.exists() ? userSnap.data() : {}),
                ...(techSnap.exists() ? techSnap.data() : {}),
                ...(hrSnap.exists() ? hrSnap.data() : {}),
                uid: user.uid
            };
            setProfile(merged);
            setAgreement(agreementSnap.exists() ? { id: agreementSnap.id, ...agreementSnap.data() } : null);
            const q = query(collection(db, 'staffRequests'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
            const reqSnap = await getDocs(q);
            setRequests(reqSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
            console.error('Failed to load technician HR profile:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHRData();
        if (!user?.uid) return;
        const q = query(collection(db, 'staffRequests'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
        return onSnapshot(q, snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, [user?.uid]);

    const handleFormChange = (e: any) => {
        const { name, value } = e.target;
        setRequestForm(prev => ({ ...prev, [name]: value }));
    };

    const handleOpenDialog = (requestType = 'annual_leave') => {
        setRequestForm({ requestType, startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0], hours: 0, reason: '' });
        setDialogError(null);
        setDialogSuccess(false);
        setDialogOpen(true);
    };

    const classifyPeopleAi = (message: string) => {
        const text = message.toLowerCase();
        if (['accident','injury','unsafe','emergency','danger'].some(k => text.includes(k))) return { category: 'safety', requestType: 'safety_incident', priority: 'urgent', answer: 'Urgent safety case created for HR and Operations review.' };
        if (['salary','wages','payslip','payment','deduction','wps'].some(k => text.includes(k))) return { category: 'payroll', requestType: text.includes('payslip') ? 'payslip' : 'salary_query', priority: 'high', answer: 'Payroll review case created. HR or Finance will reply inside the app.' };
        if (['overtime','extra hour','late night','worked late','rest day'].some(k => text.includes(k))) return { category: 'overtime', requestType: 'overtime', priority: 'high', answer: 'Overtime review case created.' };
        if (['leave','vacation','sick','medical','doctor','hospital'].some(k => text.includes(k))) return { category: 'leave', requestType: text.includes('sick') || text.includes('medical') || text.includes('hospital') ? 'sick_leave' : 'annual_leave', priority: 'normal', answer: 'Leave support case created.' };
        if (['visa','emirates id','passport','document','contract copy','labour card'].some(k => text.includes(k))) return { category: 'documents', requestType: 'document_update', priority: 'normal', answer: 'Document support case created.' };
        if (['accommodation','room','camp','bed','water','toilet','a/c'].some(k => text.includes(k))) return { category: 'accommodation', requestType: 'accommodation', priority: 'high', answer: 'Accommodation support case created.' };
        if (['tool','tools','helmet','gloves','ppe','uniform','drill','ladder','vehicle'].some(k => text.includes(k))) return { category: 'tools_ppe', requestType: text.includes('vehicle') ? 'vehicle_issue' : 'tools_ppe', priority: 'normal', answer: 'Tools, PPE, or vehicle case created.' };
        if (['supervisor','manager','unfair','pressure','complaint'].some(k => text.includes(k))) return { category: 'manager_issue', requestType: 'manager_issue', priority: 'urgent', answer: 'Private HR review case created.' };
        return { category: 'general_hr', requestType: 'hr_support', priority: 'normal', answer: 'General HR support case created.' };
    };

    const identity = () => ({ uid: user?.uid, technicianId: user?.uid, email: user?.email || profile?.email || '', displayName: user?.displayName || profile?.displayName || profile?.fullName || 'Staff Member', role: user?.role || profile?.role || 'technician' });

    const handleAcceptAgreement = async () => {
        if (!user?.uid) return;
        await updateDoc(doc(db, 'staffAgreements', user.uid), { status: 'accepted', acceptedAt: serverTimestamp(), acceptedBy: user.uid, acceptanceMethod: 'paperless_staff_portal', updatedAt: serverTimestamp() });
        await addDoc(collection(db, 'auditLogs'), { action: 'STAFF_AGREEMENT_ACCEPTED', actorId: user.uid, actorName: user.displayName || profile?.displayName || profile?.fullName || 'Staff Member', targetId: user.uid, details: 'Accepted BIN GROUP paperless staff agreement.', timestamp: serverTimestamp() });
        await loadHRData();
    };

    const handlePeopleAiSubmit = async () => {
        if (!user?.uid || !aiQuestion.trim()) return;
        setAiSubmitting(true);
        try {
            const result = classifyPeopleAi(aiQuestion);
            await addDoc(collection(db, 'hrAiConversations'), { ...identity(), question: aiQuestion.trim(), category: result.category, requestType: result.requestType, priority: result.priority, answer: result.answer, source: 'bin_people_ai', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            await addDoc(collection(db, 'staffRequests'), { ...identity(), requestType: result.requestType, category: result.category, priority: result.priority, startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0], hours: 0, reason: aiQuestion.trim(), aiAnswer: result.answer, status: 'pending_hr_review', source: 'bin_people_ai', paperless: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            setAiAnswer(result.answer);
            setAiQuestion('');
        } finally { setAiSubmitting(false); }
    };

    const handleMoodCheckin = async (mood: string) => {
        if (!user?.uid) return;
        setMoodSubmitting(true);
        try {
            const riskScore = mood === 'urgent' ? 100 : mood === 'angry' ? 85 : mood === 'stressed' ? 70 : mood === 'sick' ? 65 : mood === 'okay' ? 35 : 10;
            await addDoc(collection(db, 'staffMoodCheckins'), { ...identity(), mood, riskScore, source: 'paperless_staff_portal', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            if (riskScore >= 70) await addDoc(collection(db, 'staffRequests'), { ...identity(), requestType: 'staff_wellbeing', category: 'wellbeing', priority: riskScore >= 85 ? 'urgent' : 'high', reason: `Mood check-in risk detected: ${mood}`, status: 'pending_hr_review', source: 'mood_checkin', paperless: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        } finally { setMoodSubmitting(false); }
    };

    const handleRequestSubmit = async () => {
        if (!user?.uid) return;
        if (!requestForm.reason.trim()) {
            setDialogError('Please provide a reason for your request.');
            return;
        }
        const selected = STAFF_REQUEST_TYPES.find(([value]) => value === requestForm.requestType);
        setSubmitting(true);
        setDialogError(null);
        try {
            await addDoc(collection(db, 'staffRequests'), { ...identity(), requestType: requestForm.requestType, requestLabel: selected?.[1] || requestForm.requestType, startDate: requestForm.startDate, endDate: requestForm.endDate, hours: parseFloat(requestForm.hours as any) || 0, reason: requestForm.reason.trim(), status: 'pending_hr_review', source: 'paperless_staff_portal', paperless: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            setDialogSuccess(true);
            setTimeout(() => setDialogOpen(false), 1200);
        } catch (err: any) {
            console.error('Failed to submit request:', err);
            setDialogError(err.message || 'Failed to submit request. Please try again.');
        } finally { setSubmitting(false); }
    };

    const getDaysRemaining = (expiryDateStr: string) => {
        if (!expiryDateStr || expiryDateStr === 'Pending sync') return null;
        const expiry = new Date(expiryDateStr);
        if (isNaN(expiry.getTime())) return null;
        return Math.ceil((expiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    };

    const getDocumentAlerts = () => {
        const warnings: { name: string; days: number | null; type: 'expired' | 'critical' | 'warning' }[] = [];
        const documents = [
            { name: 'Visa', date: profile?.visaExpiry || profile?.visaExpiryDate },
            { name: 'Emirates ID', date: profile?.emiratesIdExpiry || profile?.eidExpiry },
            { name: 'Passport', date: profile?.passportExpiry || profile?.passportExpiryDate },
            { name: 'Medical Card', date: profile?.medicalExpiry || profile?.healthCardExpiry },
            { name: 'Driving License', date: profile?.drivingLicenseExpiry },
            { name: 'Trade Certificate', date: profile?.tradeCertificateExpiry || profile?.certificationExpiry },
        ];
        documents.forEach(doc => {
            if (!doc.date) warnings.push({ name: doc.name, days: null, type: 'warning' });
            else {
                const days = getDaysRemaining(doc.date);
                if (days !== null) {
                    if (days < 0) warnings.push({ name: doc.name, days, type: 'expired' });
                    else if (days <= 30) warnings.push({ name: doc.name, days, type: 'critical' });
                }
            }
        });
        return warnings;
    };

    if (loading) return <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10, gap: 2 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /><Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>Loading Paperless HR...</Typography></Box>;

    const alerts = getDocumentAlerts();
    const dutyStatus = profile?.dutyStatus || 'OFF';
    const shift = profile?.shiftName || profile?.shift || profile?.workingHours || 'Pending sync';
    const offDay = profile?.offDay || 'Pending sync';
    const supervisor = profile?.supervisorName || profile?.managerName || 'Operations Lead';
    const leaveBalance = profile?.leaveBalance ?? 30;
    const salaryPackage = profile?.salaryPackage || {};
    const grossSalary = profile?.salary || salaryPackage.grossSalary;
    const dispatchReady = alerts.length === 0;

    const InfoRow = ({ label, value }: any) => <><Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" gap={2}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{label}</Typography><Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800, textAlign: isRTL ? 'left' : 'right' }}>{value || 'Pending sync'}</Typography></Stack><Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} /></>;

    return (
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 955, letterSpacing: 4 }}>BIN PEOPLE AI · PAPERLESS STAFF OPERATIONS</Typography>
                    <Typography variant="h3" fontWeight="950" color="#FFF">{t('dash.tech.hr_title') || 'HR Self-Service'}</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 1, maxWidth: 840 }}>Submit leave, payroll, overtime, document, HR letter, safety, accommodation, tools/PPE, and private HR cases without paper forms.</Typography>
                </Box>
                <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => handleOpenDialog()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>NEW REQUEST</Button>
            </Box>

            {alerts.length > 0 && <Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.22)', borderRadius: 5, textAlign: isRTL ? 'right' : 'left' }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ mb: 2 }}><AlertTriangle color="#ef4444" size={24} /><Typography variant="subtitle1" fontWeight="955" color="#FFF">DOCUMENT COMPLIANCE ALERTS</Typography></Stack><Grid container spacing={2}>{alerts.map((alert, idx) => <Grid item xs={12} sm={6} md={4} key={idx}><Alert severity={alert.type === 'expired' ? 'error' : alert.type === 'critical' ? 'warning' : 'info'} variant="outlined" sx={{ color: '#fff', bgcolor: 'transparent' }}><strong>{alert.name}</strong> {alert.type === 'expired' ? 'expired.' : alert.type === 'critical' ? `expires in ${alert.days} days.` : 'record is missing.'}</Alert></Grid>)}</Grid></Paper>}

            <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} sm={6} md={3}><Paper sx={{ p: 3, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>DUTY STATUS</Typography><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{dutyStatus}</Typography></Paper></Grid>
                <Grid item xs={12} sm={6} md={3}><Paper sx={{ p: 3, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>DISPATCH READINESS</Typography><Typography variant="h6" sx={{ color: dispatchReady ? '#10b981' : '#eab308', fontWeight: 950 }}>{dispatchReady ? 'READY' : 'HR REVIEW'}</Typography></Paper></Grid>
                <Grid item xs={12} sm={6} md={3}><Paper sx={{ p: 3, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>LEAVE BALANCE</Typography><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{leaveBalance} Days</Typography></Paper></Grid>
                <Grid item xs={12} sm={6} md={3}><Paper sx={{ p: 3, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>PAYROLL STATUS</Typography><Typography variant="h6" sx={{ color: '#10b981', fontWeight: 950 }}>{profile?.payrollStatus || 'ACTIVE'}</Typography></Paper></Grid>
            </Grid>

            <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} md={4}><Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mb: 3 }}><User color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Staff Control Profile</Typography></Stack><Stack spacing={2}><InfoRow label="NAME" value={user?.displayName || profile?.displayName || profile?.fullName} /><InfoRow label="ROLE" value={user?.role || profile?.role} /><InfoRow label="TRADE" value={profile?.trade || profile?.specialization || 'General Maintenance'} /><InfoRow label="SUPERVISOR" value={supervisor} /><InfoRow label="BASE ZONE" value={profile?.baseZone || profile?.emirate} /></Stack></Paper></Grid>
                <Grid item xs={12} md={4}><Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mb: 3 }}><Calendar color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Shift & Attendance</Typography></Stack><Stack spacing={2}><InfoRow label="SHIFT" value={shift} /><InfoRow label="WEEKLY OFF" value={offDay} /><InfoRow label="LAST CHECK-IN" value={profile?.lastCheckIn} /><InfoRow label="ROSTER" value={profile?.rosterStatus || 'Active'} /></Stack></Paper></Grid>
                <Grid item xs={12} md={4}><Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mb: 3 }}><DollarSign color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Payroll & EOS</Typography></Stack><Stack spacing={2}><InfoRow label="BASIC SALARY" value={profile?.basicSalary ? `AED ${profile.basicSalary.toLocaleString()}` : undefined} /><InfoRow label="ALLOWANCES" value={profile?.allowances ? `AED ${profile.allowances.toLocaleString()}` : undefined} /><InfoRow label="GROSS SALARY" value={grossSalary ? `AED ${Number(grossSalary).toLocaleString()}` : undefined} /><InfoRow label="WPS STATUS" value={profile?.wpsStatus || 'Pending sync'} /><InfoRow label="EOSB MODE" value={profile?.eosbMode || 'Traditional gratuity / savings ready'} /></Stack></Paper></Grid>
            </Grid>

            <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mb: 3 }}><FileText color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Sovereign Compliance Dossier</Typography></Stack><Grid container spacing={2}>{['visaExpiry','emiratesIdExpiry','passportExpiry','medicalExpiry','drivingLicenseExpiry','tradeCertificateExpiry'].map((key) => <Grid item xs={12} sm={6} md={4} key={key}><Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}><Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>{key.replace(/([A-Z])/g, ' $1').toUpperCase()}</Typography><Typography variant="h6" fontWeight="900" color="#FFF" sx={{ mt: 1 }}>{profile?.[key] || 'Pending sync'}</Typography></Paper></Grid>)}</Grid></Paper>

            {agreement && agreement.status !== 'accepted' && <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(198,167,94,0.08)', border: '1px solid rgba(198,167,94,0.32)', borderRadius: 6 }}><Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 2 }}>Pending Staff Agreement</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', mb: 3 }}>{agreement.agreementText || 'Please review and accept your staff agreement acknowledgement.'}</Typography><Button variant="contained" onClick={handleAcceptAgreement} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>ACCEPT DIGITALLY</Button></Paper>}

            <Grid container spacing={3} sx={{ mb: 4 }}><Grid item xs={12} md={7}><Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}><Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 2 }}>BIN People AI</Typography><Stack direction={{ xs: 'column', md: 'row' }} spacing={2}><TextField fullWidth placeholder="Type your HR issue here" value={aiQuestion} onChange={(e) => setAiQuestion(e.target.value)} multiline minRows={2} sx={{ textarea: { color: '#fff' } }} /><Button variant="contained" onClick={handlePeopleAiSubmit} disabled={aiSubmitting || !aiQuestion.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{aiSubmitting ? <CircularProgress size={22} sx={{ color: '#000' }} /> : 'CREATE CASE'}</Button></Stack>{aiAnswer && <Alert severity="success" sx={{ mt: 2 }}>{aiAnswer}</Alert>}</Paper></Grid><Grid item xs={12} md={5}><Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}><Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 2 }}>Wellbeing Check-In</Typography><Grid container spacing={1}>{['okay','tired','sick','stressed','angry','urgent'].map(mood => <Grid item xs={6} sm={4} key={mood}><Button fullWidth variant="outlined" disabled={moodSubmitting} onClick={() => handleMoodCheckin(mood)} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>{mood.toUpperCase()}</Button></Grid>)}</Grid></Paper></Grid></Grid>

            <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}><Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 3 }}>Fast Paperless Requests</Typography><Grid container spacing={1.5}>{STAFF_REQUEST_TYPES.slice(0, 18).map(([value, label]) => <Grid item xs={12} sm={6} md={3} key={value}><Button fullWidth variant="outlined" onClick={() => handleOpenDialog(value)} sx={{ justifyContent: 'flex-start', borderColor: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 850 }}>{label}</Button></Grid>)}</Grid></Paper>

            <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}><Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 3 }}>HR Request Registry</Typography>{requests.length === 0 ? <Typography variant="body2" color="rgba(255,255,255,0.4)">No requests submitted yet.</Typography> : <Stack spacing={2}>{requests.map(req => <Paper key={req.id} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}><Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={2}><Box><Typography variant="subtitle2" fontWeight="900" color="#FFF" sx={{ textTransform: 'uppercase' }}>{String(req.requestLabel || req.requestType).replace(/_/g, ' ')}</Typography><Typography variant="caption" color="rgba(255,255,255,0.5)">Period: {req.startDate} to {req.endDate} {req.hours > 0 && `(${req.hours} hours)`}</Typography><Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.8)' }}>{req.reason}</Typography>{req.reviewNote && <Typography variant="body2" sx={{ mt: 1, color: binThemeTokens.gold }}>HR NOTE: {req.reviewNote}</Typography>}</Box><Chip label={String(req.status || 'pending_hr_review').replace(/_/g, ' ').toUpperCase()} size="small" sx={{ fontWeight: 900, bgcolor: req.status === 'approved' ? 'rgba(16,185,129,0.1)' : req.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', color: req.status === 'approved' ? '#10b981' : req.status === 'rejected' ? '#ef4444' : '#eab308' }} /></Stack></Paper>)}</Stack>}</Paper>

            <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#0f172a', color: '#fff', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', direction: isRTL ? 'rtl' : 'ltr' } }}><DialogTitle sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 2 }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center"><Plus color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="955">SUBMIT PAPERLESS STAFF REQUEST</Typography></Stack></DialogTitle><DialogContent sx={{ mt: 2 }}>{dialogSuccess && <Alert severity="success" sx={{ mb: 3 }}>Request submitted to HR registry.</Alert>}{dialogError && <Alert severity="error" sx={{ mb: 3 }}>{dialogError}</Alert>}<Stack spacing={3}><FormControl fullWidth variant="outlined"><InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Request Type</InputLabel><Select name="requestType" value={requestForm.requestType} onChange={handleFormChange} label="Request Type" sx={{ color: '#fff', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}>{STAFF_REQUEST_TYPES.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>{!['payslip','salary_query','salary_certificate','noc_letter','experience_letter','contract_copy','document_update','hr_support','manager_issue'].includes(requestForm.requestType) && <Grid container spacing={2}><Grid item xs={6}><TextField fullWidth label="Start Date" name="startDate" type="date" value={requestForm.startDate} onChange={handleFormChange} variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }} /></Grid><Grid item xs={6}><TextField fullWidth label="End Date" name="endDate" type="date" value={requestForm.endDate} onChange={handleFormChange} variant="outlined" InputLabelProps={{ shrink: true }} sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }} /></Grid></Grid>}{requestForm.requestType === 'overtime' && <TextField fullWidth label="Overtime Hours Claimed" name="hours" type="number" value={requestForm.hours} onChange={handleFormChange} variant="outlined" sx={{ input: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }} />}<TextField fullWidth label="Reason / Detailed Notes" name="reason" multiline rows={4} value={requestForm.reason} onChange={handleFormChange} variant="outlined" required placeholder="Provide full justification for your request..." sx={{ textarea: { color: '#fff' }, label: { color: 'rgba(255,255,255,0.5)' } }} /></Stack></DialogContent><DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.1)' }}><Button onClick={() => setDialogOpen(false)} disabled={submitting} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>CANCEL</Button><Button variant="contained" onClick={handleRequestSubmit} disabled={submitting || dialogSuccess} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4 }}>{submitting ? <CircularProgress size={24} sx={{ color: '#000' }} /> : 'SUBMIT'}</Button></DialogActions></Dialog>
        </Box>
    );
}
