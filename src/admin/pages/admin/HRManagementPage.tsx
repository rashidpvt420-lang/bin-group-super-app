import React, { useMemo, useState, useEffect } from 'react';
import {
    Container, Typography, Box, Paper, Grid, Stack, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, Avatar, alpha, CircularProgress, Tab, Tabs, TextField, InputAdornment,
    IconButton, Alert, LinearProgress, Divider, FormControl, InputLabel, Select, MenuItem,
    Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
    DollarSign,
    FileText,
    UserPlus,
    ChevronRight,
    Search as SearchIcon,
    Bot,
    ShieldCheck,
    HeartPulse,
    Landmark,
    Clock,
    AlertTriangle,
    ClipboardCheck,
    Calculator,
    Sun,
    Users as UsersIcon
} from 'lucide-react';
import {
    db,
    collection,
    query,
    onSnapshot,
    where,
    doc,
    updateDoc,
    serverTimestamp,
    addDoc,
    orderBy,
    limit,
    httpsCallable,
    auth,
    functions,
    storage,
    ref,
    uploadBytes,
    getDownloadURL
} from '@/lib/firebase';
import { useLanguage } from '../../../context/LanguageContext';
import { binThemeTokens } from '../../theme/adminTheme';
import { useAuth } from '../../context/AuthContext';
import RegisterStaffDialog from '../../components/RegisterStaffDialog';
import {
    HR_SELF_SERVICE_REQUEST_TYPES,
    HR_SELF_SERVICE_COLLECTIONS,
    PAPERLESS_HR_PUBLIC_COPY
} from '../../../lib/hrSelfServiceBlueprint';
import {
 feat/hr-self-service-letters-and-confidentiality
    buildNocLetterDoc,
    buildExperienceLetterDoc,
    buildSalaryCertificateDoc,
    savePdfMobileSafe,
    type HrLetterIssuer,
    type HrLetterStaffInfo
} from '../../../utils/hrLetterPdf';

    BIN_GROUP_PRIMARY_ENTITY,
    calculateEosbEstimate,
    summarizeEmiratisation,
    summarizeGpssaRegistrations,
    getHeatStressSeasonStatus,
    type EosbTerminationReason
} from '../../../lib/uaeWorkforceComplianceEngine';
 main

type RiskTone = 'success' | 'warning' | 'error' | 'info';

type StaffReadiness = {
    score: number;
    missing: number;
    expired: number;
};

const STAFF_ROLES = [
    'technician',
    'hr_staff',
    'hr_manager',
    'finance_staff',
    'account_manager',
    'finance_admin',
    'operations_manager',
    'dispatcher'
];

const REQUEST_STATUS_COLORS: Record<string, string> = {
    approved: '#10b981',
    rejected: '#ef4444',
    pending_hr_review: '#eab308',
    pending_finance_review: '#f59e0b',
    escalated: '#f97316',
    closed: '#94a3b8'
};

const LETTER_REQUEST_TYPES = ['noc_letter', 'experience_letter', 'salary_certificate'];

const SOVEREIGN_HR_MODULES = [
    {
        title: 'Everything Request Engine',
        metric: '19 request families',
        detail: 'Leave, sick leave, overtime, payslip, salary query, letters, documents, safety, accommodation, tools/PPE, transport, wellbeing, and private HR cases.',
        icon: Bot
    },
    {
        title: 'Paperless Staff Dossier',
        metric: `${HR_SELF_SERVICE_COLLECTIONS.length} HR collections`,
        detail: 'Profiles, documents, payslips, attendance, assets, complaints, training, agreements, AI conversations, and audit logs.',
        icon: ClipboardCheck
    },
    {
        title: 'Zero-Trust HR Vault',
        metric: 'Sensitive fields isolated',
        detail: 'Designed for role-based access, audit evidence, and future confidential-computing / encryption boundaries for payroll, identity, and wellness data.',
        icon: ShieldCheck
    },
    {
        title: 'Predictive Workforce Care',
        metric: 'Mood + attrition signals',
        detail: 'Wellbeing check-ins and AI case creation give HR a live early-warning layer before a field staff issue becomes operational risk.',
        icon: HeartPulse
    },
    {
        title: 'UAE Payroll Compliance Layer',
        metric: 'WPS-ready model',
        detail: 'Payroll records, payslip generation, bank/payroll-card references, overtime requests, and compliance notes are structured for WPS integration.',
        icon: Landmark
    }
];

const INTEGRATION_READINESS = [
    {
        name: 'UAE Pass OIDC identity',
        status: 'API CONTRACT REQUIRED',
        tone: 'warning' as RiskTone,
        note: 'Use for verified employee onboarding once official UAE Pass integration credentials are issued.'
    },
    {
        name: 'MoHRE / WPS payroll sync',
        status: 'STRUCTURE READY',
        tone: 'info' as RiskTone,
        note: 'Current app captures payroll and staff request records; live government transmission requires approved provider/API access.'
    },
    {
        name: 'Confidential payroll vault',
        status: 'ARCHITECTURE READY',
        tone: 'info' as RiskTone,
        note: 'Move sensitive HR workloads behind stronger server-side controls before storing health, biometric, or deep payroll data.'
    },
    {
        name: 'ADGM DLT benefit governance',
        status: 'FUTURE MODULE',
        tone: 'warning' as RiskTone,
        note: 'Do not activate tokenized benefit governance until legal, accounting, and ADGM structuring are complete.'
    },
    {
        name: 'FHE biometric wellness',
        status: 'FUTURE MODULE',
        tone: 'warning' as RiskTone,
        note: 'Wellness check-ins are safe now; biometric telemetry must remain opt-in and encrypted by design.'
    }
];

const PAYROLL_PERIOD = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

const parseDateValue = (value: any): Date | null => {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: any) => {
    const parsed = parseDateValue(value);
    return parsed ? parsed.toLocaleDateString() : 'N/A';
};

const daysUntil = (value: any) => {
    const parsed = parseDateValue(value);
    if (!parsed) return null;
    return Math.ceil((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

const formatMoney = (value: any) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 'Pending sync';
    return `AED ${amount.toLocaleString()}`;
};

const requestTitle = (value: string) => String(value || 'hr_support').replace(/_/g, ' ').toUpperCase();

export default function HRManagementPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { lang, tx } = useLanguage();
    const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

    const [tab, setTab] = useState(0);
    const [staff, setStaff] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [moodCheckins, setMoodCheckins] = useState<any[]>([]);
    const [aiConversations, setAiConversations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [requestFilter, setRequestFilter] = useState('all');
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    const [payrollError, setPayrollError] = useState<string | null>(null);
    const [dataWarning, setDataWarning] = useState<string | null>(null);
    const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
    const [reviewDialog, setReviewDialog] = useState<{ open: boolean; requestId: string; approve: boolean } | null>(null);
    const [reviewNote, setReviewNote] = useState('');
 feat/hr-self-service-letters-and-confidentiality
    const [letterDialog, setLetterDialog] = useState<{ open: boolean; request: any } | null>(null);
    const [letterPurpose, setLetterPurpose] = useState('');
    const [letterLastWorkingDate, setLetterLastWorkingDate] = useState('');
    const [letterIssuing, setLetterIssuing] = useState(false);
    const [letterError, setLetterError] = useState<string | null>(null);

    const [eosbDialogOpen, setEosbDialogOpen] = useState(false);
    const [eosbStaffId, setEosbStaffId] = useState('');
    const [eosbBasicSalary, setEosbBasicSalary] = useState('');
    const [eosbJoiningDate, setEosbJoiningDate] = useState('');
    const [eosbLastWorkingDate, setEosbLastWorkingDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [eosbReason, setEosbReason] = useState<EosbTerminationReason>('resignation');
 main

    const isHRManager = user?.role === 'hr_manager' || user?.role === 'admin' || user?.role === 'ceo';
    const isHRStaff = user?.role === 'hr_staff' || isHRManager;
    const isFinanceRole = ['finance_staff', 'account_manager', 'finance_admin'].includes(user?.role || '');

    const getStatusColor = (status: string) => {
        switch (String(status || '').toUpperCase()) {
            case 'ACTIVE': return '#10b981';
            case 'ON_LEAVE': return '#f59e0b';
            case 'INACTIVE': return '#ef4444';
            default: return 'rgba(255,255,255,0.4)';
        }
    };

    const getPayrollErrorMessage = (err: any) => {
        const code = err?.code || 'functions/internal';
        const message = err?.message || 'No additional detail was returned.';

        if (code === 'functions/unauthenticated') {
            return 'Your admin session expired. Sign in again and retry payslip generation.';
        }
        if (code === 'functions/permission-denied') {
            return 'Your account does not have HR or finance permission to generate payslips.';
        }
        if (code === 'functions/failed-precondition') {
            return 'Payroll email is not configured in Firebase Secrets. Configure SMTP_USER and SMTP_PASS before retrying.';
        }
        if (code === 'functions/invalid-argument') {
            return `Payslip data is incomplete. ${message}`;
        }
        return `Payslip could not be generated (${code}). ${message}`;
    };

    const getStaffReadiness = (s: any): StaffReadiness => {
        const requiredFields = [
            'emiratesIdNumber',
            'trade',
            'baseZone',
            'visaExpiry',
            'emiratesIdExpiry',
            'passportExpiry',
            'medicalExpiry',
            'tradeCertificateExpiry',
            'occupationalHealthCardExpiry',
            'ppeStatus',
            'safetyTrainingStatus',
            'toolKitId',
            'ppeIssuedAt',
            'assetAcknowledgementStatus'
        ];
        const expiryFields = ['visaExpiry', 'emiratesIdExpiry', 'passportExpiry', 'medicalExpiry', 'tradeCertificateExpiry', 'occupationalHealthCardExpiry'];
        const missing = requiredFields.filter((key) => !s?.[key] && !s?.salaryPackage?.[key]).length;
        const expired = expiryFields.filter((key) => {
            const days = daysUntil(s?.[key]);
            return days !== null && days < 0;
        }).length;
        const score = Math.max(0, Math.round(((requiredFields.length - missing - expired) / requiredFields.length) * 100));
        return { score, missing, expired };
    };

    useEffect(() => {
        const unsubscribeFns: Array<() => void> = [];
        setLoading(true);

        try {
            const staffQuery = query(collection(db, 'users'), where('role', 'in', STAFF_ROLES));
            unsubscribeFns.push(onSnapshot(staffQuery, (snap) => {
                setStaff(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
                setLoading(false);
            }, (error) => {
                console.error('HR staff registry sync failed:', error);
                setDataWarning('Staff registry sync failed. Check Firestore rules/indexes for HR roles.');
                setLoading(false);
            }));
        } catch (error) {
            console.error('HR staff query creation failed:', error);
            setDataWarning('Staff registry query could not start.');
            setLoading(false);
        }

        try {
            const requestQuery = query(collection(db, 'staffRequests'), orderBy('createdAt', 'desc'), limit(150));
            unsubscribeFns.push(onSnapshot(requestQuery, (snap) => {
                setRequests(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
            }, (error) => {
                console.error('HR request queue sync failed:', error);
                setDataWarning('Request queue sync failed. Check staffRequests permissions.');
            }));
        } catch (error) {
            console.error('HR request query creation failed:', error);
        }

        try {
            const moodQuery = query(collection(db, 'staffMoodCheckins'), orderBy('createdAt', 'desc'), limit(80));
            unsubscribeFns.push(onSnapshot(moodQuery, (snap) => {
                setMoodCheckins(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
            }, (error) => {
                console.warn('Mood check-in sync skipped:', error);
            }));
        } catch (error) {
            console.warn('Mood check-in query creation skipped:', error);
        }

        try {
            const aiQuery = query(collection(db, 'hrAiConversations'), orderBy('createdAt', 'desc'), limit(80));
            unsubscribeFns.push(onSnapshot(aiQuery, (snap) => {
                setAiConversations(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
            }, (error) => {
                console.warn('AI HR conversation sync skipped:', error);
            }));
        } catch (error) {
            console.warn('AI HR query creation skipped:', error);
        }

        return () => unsubscribeFns.forEach((unsubscribe) => unsubscribe());
    }, []);

    const filteredStaff = useMemo(() => {
        const needle = searchTerm.trim().toLowerCase();
        if (!needle) return staff;
        return staff.filter((s) => [
            s.displayName,
            s.fullName,
            s.email,
            s.role,
            s.specialization,
            s.trade,
            s.employeeCode,
            s.emirate,
            s.baseZone
        ].some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [staff, searchTerm]);

    const visibleRequests = useMemo(() => {
        return requests.filter((req) => {
            const isPayslip = req.requestType === 'payslip';
            if (isPayslip && !(isHRStaff || isFinanceRole)) return false;
            if (!isPayslip && !isHRStaff) return false;
            if (requestFilter === 'all') return true;
            return req.requestType === requestFilter || req.category === requestFilter || req.priority === requestFilter || req.status === requestFilter;
        });
    }, [requests, requestFilter, isHRStaff, isFinanceRole]);

    const hrStats = useMemo(() => {
        const activeStaff = staff.filter((s) => String(s.status || 'ACTIVE').toUpperCase() === 'ACTIVE').length;
        const pending = visibleRequests.filter((req) => req.status === 'pending_hr_review').length;
        const urgent = visibleRequests.filter((req) => req.priority === 'urgent').length;
        const highRiskMood = moodCheckins.filter((entry) => Number(entry.riskScore || 0) >= 70).length;
        const avgReadiness = staff.length
            ? Math.round(staff.reduce((sum, s) => sum + getStaffReadiness(s).score, 0) / staff.length)
            : 0;
        return { activeStaff, pending, urgent, highRiskMood, avgReadiness };
    }, [staff, visibleRequests, moodCheckins]);

    const emiratisationStatus = useMemo(() => summarizeEmiratisation(staff, { baselineYear: 2024 }), [staff]);
    const gpssaSummary = useMemo(() => summarizeGpssaRegistrations(staff), [staff]);
    const heatStress = useMemo(() => getHeatStressSeasonStatus(), []);

    const eosbSelectedStaff = useMemo(() => staff.find((s) => s.id === eosbStaffId) || null, [staff, eosbStaffId]);

    const eosbResult = useMemo(() => {
        const basicSalary = Number(eosbBasicSalary || 0);
        if (!basicSalary || !eosbJoiningDate || !eosbLastWorkingDate) return null;
        return calculateEosbEstimate({
            basicMonthlySalaryAed: basicSalary,
            joiningDate: new Date(eosbJoiningDate),
            lastWorkingDate: new Date(eosbLastWorkingDate),
            terminationReason: eosbReason,
        });
    }, [eosbBasicSalary, eosbJoiningDate, eosbLastWorkingDate, eosbReason]);

    const handleOpenEosbDialog = (s?: any) => {
        if (s) {
            setEosbStaffId(s.id);
            setEosbBasicSalary(String(s.basicSalary || s.salaryPackage?.basicSalary || ''));
            const joinValue = s.joiningDate || s.hireDate;
            setEosbJoiningDate(joinValue ? String(parseDateValue(joinValue)?.toISOString().slice(0, 10) || '') : '');
        } else {
            setEosbStaffId('');
            setEosbBasicSalary('');
            setEosbJoiningDate('');
        }
        setEosbLastWorkingDate(new Date().toISOString().slice(0, 10));
        setEosbReason('resignation');
        setEosbDialogOpen(true);
    };

    const handleReviewRequest = async (requestId: string, approve: boolean, note: string) => {
        try {
            const nextStatus = approve ? 'approved' : 'rejected';
            const docRef = doc(db, 'staffRequests', requestId);
            await updateDoc(docRef, {
                status: nextStatus,
                reviewedById: user?.uid || null,
                reviewedBy: user?.displayName || user?.email || 'HR Manager',
                reviewedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                reviewNote: note || (approve ? 'Approved by HR Command.' : 'Rejected by HR Command.')
            });
            await addDoc(collection(db, 'auditLogs'), {
                action: approve ? 'HR_REQUEST_APPROVED' : 'HR_REQUEST_REJECTED',
                actorId: user?.uid || null,
                actorName: user?.displayName || user?.email || 'HR Manager',
                targetId: requestId,
                details: note || nextStatus,
                module: 'hr_command',
                timestamp: serverTimestamp()
            });
        } catch (err: any) {
            console.error('Failed to review request:', err);
            setDataWarning(`Error reviewing request: ${err.message}`);
        } finally {
            setReviewDialog(null);
            setReviewNote('');
        }
    };

    const handleOpenLetterDialog = (req: any) => {
        setLetterError(null);
        setLetterPurpose(req.reason && req.reason !== 'No reason provided' ? req.reason : '');
        setLetterLastWorkingDate('');
        setLetterDialog({ open: true, request: req });
    };

    const handleIssueLetter = async () => {
        const req = letterDialog?.request;
        if (!req) return;

        const requiresPurpose = req.requestType !== 'experience_letter';
        if (requiresPurpose && !letterPurpose.trim()) {
            setLetterError('Enter a purpose for this letter before issuing.');
            return;
        }

        setLetterIssuing(true);
        setLetterError(null);
        try {
            const matchedStaff = staff.find((s) => s.id === req.uid || (req.email && s.email === req.email)) || null;
            const joiningDate = parseDateValue(matchedStaff?.joiningDate) || parseDateValue(req.joiningDate) || new Date();
            const staffInfo: HrLetterStaffInfo = {
                fullName: req.displayName || matchedStaff?.displayName || matchedStaff?.fullName || 'Staff Member',
                position: matchedStaff?.trade || matchedStaff?.specialization || matchedStaff?.role || 'Staff',
                staffCode: matchedStaff?.employeeCode,
                joiningDate
            };
            const issuer: HrLetterIssuer = {
                hrName: user?.displayName || user?.email || 'HR Department',
                hrDesignation: isHRManager ? 'HR Manager' : 'HR Department'
            };
            const referenceNumber = `BG-${req.requestType.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-8)}`;
            const issueDate = new Date();

            let built: { doc: any; filename: string };
            if (req.requestType === 'noc_letter') {
                built = buildNocLetterDoc({ staff: staffInfo, issuer, purpose: letterPurpose.trim(), referenceNumber, issueDate });
            } else if (req.requestType === 'experience_letter') {
                built = buildExperienceLetterDoc({
                    staff: staffInfo,
                    issuer,
                    lastWorkingDate: letterLastWorkingDate ? new Date(letterLastWorkingDate) : null,
                    referenceNumber,
                    issueDate
                });
            } else if (req.requestType === 'salary_certificate') {
                const basicSalaryAed = Number(matchedStaff?.basicSalary || matchedStaff?.salaryPackage?.basicSalary || 0);
                const allowances = Number(matchedStaff?.allowances || matchedStaff?.salaryPackage?.allowances || 0);
                if (!basicSalaryAed) {
                    throw new Error('Salary data is not configured for this staff member. Update salary records before issuing a salary certificate.');
                }
                built = buildSalaryCertificateDoc({
                    staff: staffInfo,
                    issuer,
                    basicSalaryAed,
                    grossSalaryAed: basicSalaryAed + allowances,
                    purpose: letterPurpose.trim(),
                    referenceNumber,
                    issueDate
                });
            } else {
                throw new Error('Unsupported letter type for this request.');
            }

            const staffUid = req.uid || matchedStaff?.id || null;
            let fileUrl: string | null = null;
            if (staffUid) {
                try {
                    const storagePath = `hrDocuments/${staffUid}/letters/${referenceNumber}-${built.filename}`;
                    const fileRef = ref(storage, storagePath);
                    await uploadBytes(fileRef, built.doc.output('blob'), { contentType: 'application/pdf' });
                    fileUrl = await getDownloadURL(fileRef);
                } catch (uploadErr) {
                    console.warn('[HR] Letter Storage upload failed, continuing with local download only:', uploadErr);
                }
            }

            const result = savePdfMobileSafe(built.doc, built.filename);
            if (!result?.ok && !fileUrl) {
                throw new Error('PDF generation failed on this device. Try a different browser and retry.');
            }

            await addDoc(collection(db, 'staffLetters'), {
                requestId: req.id,
                uid: staffUid,
                email: req.email || matchedStaff?.email || null,
                staffName: staffInfo.fullName,
                letterType: req.requestType,
                referenceNumber,
                purpose: letterPurpose.trim() || null,
                lastWorkingDate: letterLastWorkingDate || null,
                fileUrl,
                issuedById: user?.uid || null,
                issuedBy: user?.displayName || user?.email || 'HR Department',
                issuedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            });

            await handleReviewRequest(req.id, true, `Letter issued: ${referenceNumber}`);
            setLetterDialog(null);
        } catch (err: any) {
            console.error('Failed to issue letter:', err);
            setLetterError(err.message || 'Letter generation failed.');
        } finally {
            setLetterIssuing(false);
        }
    };

    const handleGeneratePayslip = async (s: any) => {
        setGeneratingId(s.id);
        setPayrollError(null);
        try {
            if (!auth.currentUser) {
                setPayrollError('Your admin session is not active. Sign in again before generating payslips.');
                return;
            }
            await auth.currentUser.getIdToken(true);
            const genFn = httpsCallable(functions, 'generateAndEmailPayslip');
            const basicSalary = Number(s.basicSalary || s.salaryPackage?.basicSalary || s.salary || 0);
            const allowances = Number(s.allowances || s.salaryPackage?.allowances || 0);
            if (!basicSalary && !allowances) {
                throw new Error("Salary data is Not Configured for this staff member.");
            }
            const result: any = await genFn({
                staffId: s.id,
                staffName: s.displayName || s.fullName || 'Staff Member',
                staffEmail: s.email,
                payPeriod: PAYROLL_PERIOD,
                basicSalary,
                allowances,
                overtime: s.pendingOvertimePay || 0,
                deductions: s.deductions || 0
            });
            if (result.data?.success) {
                setDataWarning(null);
                setPayrollError(null);
            }
        } catch (err: any) {
            console.error('Payroll fault:', err);
            setPayrollError(getPayrollErrorMessage(err));
        } finally {
            setGeneratingId(null);
        }
    };

    const MetricCard = ({ title, value, caption, tone = 'info' }: { title: string; value: string | number; caption: string; tone?: RiskTone }) => {
        const color = tone === 'success' ? '#10b981' : tone === 'warning' ? '#eab308' : tone === 'error' ? '#ef4444' : binThemeTokens.gold;
        return (
            <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: `1px solid ${alpha(color, 0.28)}`, borderRadius: 5 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900, letterSpacing: 1.2 }}>{title}</Typography>
                <Typography variant="h4" sx={{ color, fontWeight: 950, mt: 1 }}>{value}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 1 }}>{caption}</Typography>
            </Paper>
        );
    };

    const ModuleCard = ({ module }: { module: typeof SOVEREIGN_HR_MODULES[number] }) => {
        const Icon = module.icon;
        return (
            <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                    <Box sx={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold }}>
                        <Icon size={22} />
                    </Box>
                    <Box>
                        <Typography variant="subtitle1" sx={{ color: '#FFF', fontWeight: 950 }}>{module.title}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{module.metric}</Typography>
                    </Box>
                </Stack>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.66)' }}>{module.detail}</Typography>
            </Paper>
        );
    };

    if (loading) {
        return (
            <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: '#020617', py: 4 }}>
            <Container maxWidth="xl">
                <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
                    <Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                            BIN PEOPLE AI · SOVEREIGN HUMAN CAPITAL
                        </Typography>
                        <Typography variant="h3" fontWeight="950" color="#FFF">
                            HR <Box component="span" sx={{ color: binThemeTokens.gold }}>Command</Box>
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', maxWidth: 920, mt: 1 }}>
                            {PAPERLESS_HR_PUBLIC_COPY.shortDescription}
                        </Typography>
                    </Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                        <Button
                            variant="outlined"
                            startIcon={<DollarSign size={18} />}
                            onClick={() => navigate('/admin/financials/payroll')}
                            sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}
                        >
                            OPEN PAYROLL / FINANCIALS
                        </Button>
                        {isHRManager && (
                            <Button
                                variant="outlined"
                                startIcon={<Calculator size={18} />}
                                onClick={() => handleOpenEosbDialog()}
                                sx={{ borderColor: 'rgba(255,255,255,0.18)', color: '#FFF', fontWeight: 950 }}
                            >
                                EOSB ESTIMATOR
                            </Button>
                        )}
                        {isHRManager && (
                            <Button
                                variant="contained"
                                startIcon={<UserPlus size={18} />}
                                onClick={() => setIsRegisterDialogOpen(true)}
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                            >
                                REGISTER STAFF
                            </Button>
                        )}
                    </Stack>
                </Box>

                <RegisterStaffDialog open={isRegisterDialogOpen} onClose={() => setIsRegisterDialogOpen(false)} />

                {dataWarning && (
                    <Alert severity="warning" onClose={() => setDataWarning(null)} sx={{ mb: 3 }}>
                        {dataWarning}
                    </Alert>
                )}

                {payrollError && (
                    <Alert
                        severity="error"
                        onClose={() => setPayrollError(null)}
                        sx={{ mb: 3, bgcolor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#fecaca' }}
                    >
                        {payrollError}
                    </Alert>
                )}

                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} sm={6} md={2.4}><MetricCard title="ACTIVE STAFF" value={hrStats.activeStaff} caption={`${staff.length} total records synced`} tone="success" /></Grid>
                    <Grid item xs={12} sm={6} md={2.4}><MetricCard title="PENDING HR CASES" value={hrStats.pending} caption="Awaiting manager decision" tone={hrStats.pending > 0 ? 'warning' : 'success'} /></Grid>
                    <Grid item xs={12} sm={6} md={2.4}><MetricCard title="URGENT CASES" value={hrStats.urgent} caption="Safety, complaint, or welfare priority" tone={hrStats.urgent > 0 ? 'error' : 'success'} /></Grid>
                    <Grid item xs={12} sm={6} md={2.4}><MetricCard title="AVG READINESS" value={`${hrStats.avgReadiness}%`} caption="Dispatch + payroll compliance score" tone={hrStats.avgReadiness >= 85 ? 'success' : 'warning'} /></Grid>
                    <Grid item xs={12} sm={6} md={2.4}><MetricCard title="WELLBEING ALERTS" value={hrStats.highRiskMood} caption="Risk score 70+ from staff check-ins" tone={hrStats.highRiskMood > 0 ? 'warning' : 'success'} /></Grid>
                </Grid>

                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    variant="scrollable"
                    allowScrollButtonsMobile
                    sx={{ mb: 4, '& .MuiTab-root': { color: 'rgba(255,255,255,0.45)', fontWeight: 900 }, '& .Mui-selected': { color: `${binThemeTokens.gold} !important` } }}
                >
                    <Tab label="SOVEREIGN HR OS" />
                    <Tab label="STAFF REGISTRY" />
                    <Tab label="REQUEST QUEUE" disabled={!isHRStaff && !isFinanceRole} />
                    <Tab label="COMPLIANCE DOSSIER" disabled={!isHRStaff} />
                    <Tab label="PAYROLL HUB" disabled={!isHRManager && !isFinanceRole} />
                    <Tab label="WELLNESS & AI" disabled={!isHRStaff} />
                    <Tab label="ROADMAP" />
                </Tabs>

                {tab === 0 && (
                    <Box>
                        <Grid container spacing={3} sx={{ mb: 4 }}>
                            {SOVEREIGN_HR_MODULES.map((module) => <Grid item xs={12} md={6} lg={4} key={module.title}><ModuleCard module={module} /></Grid>)}
                        </Grid>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                                <ShieldCheck color={binThemeTokens.gold} />
                                <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>{PAPERLESS_HR_PUBLIC_COPY.title}</Typography>
                            </Stack>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 1050 }}>
                                {PAPERLESS_HR_PUBLIC_COPY.complianceNote}
                            </Typography>
                            <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.08)' }} />
                            <Grid container spacing={2}>
                                {HR_SELF_SERVICE_REQUEST_TYPES.map((request) => (
                                    <Grid item xs={12} sm={6} md={4} lg={3} key={request.value}>
                                        <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                                                <Typography variant="body2" color="#FFF" fontWeight="850">{request.label}</Typography>
                                                <Chip size="small" label={request.priority.toUpperCase()} sx={{ fontWeight: 900, fontSize: 10, bgcolor: request.priority === 'urgent' ? 'rgba(239,68,68,0.13)' : request.priority === 'high' ? 'rgba(234,179,8,0.13)' : 'rgba(16,185,129,0.12)', color: request.priority === 'urgent' ? '#ef4444' : request.priority === 'high' ? '#eab308' : '#10b981' }} />
                                            </Stack>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', fontWeight: 800 }}>{request.category}</Typography>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>
                        </Paper>
                    </Box>
                )}

                {tab === 1 && (
                    <Paper sx={{ p: 0, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
                            <TextField
                                placeholder="Search by name, role, ID, zone..."
                                size="small"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><SearchIcon size={18} color="rgba(255,255,255,0.3)" /></InputAdornment>,
                                    sx: { bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, color: '#fff' }
                                }}
                                sx={{ width: { xs: '100%', md: 440 } }}
                            />
                            <Chip label={`${filteredStaff.length} PERSONNEL SHOWN`} sx={{ fontWeight: 900 }} />
                        </Box>

                        <TableContainer>
                            <Table>
                                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableRow>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>PERSONNEL</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ROLE / SPECIALIZATION</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ZONE</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>STATUS</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>READINESS</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>PAYROLL</TableCell>
                                        <TableCell align="right"></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredStaff.map((s) => {
                                        const readiness = getStaffReadiness(s);
                                        return (
                                            <TableRow key={s.id} hover>
                                                <TableCell>
                                                    <Stack direction="row" spacing={2} alignItems="center">
                                                        <Avatar sx={{ bgcolor: alpha(binThemeTokens.gold, 0.2), color: binThemeTokens.gold, fontWeight: 900 }}>
                                                            {(s.displayName || s.fullName || 'S').charAt(0)}
                                                        </Avatar>
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="900" color="#FFF">{s.displayName || s.fullName || 'Staff Member'}</Typography>
                                                            <Typography variant="caption" color="textSecondary">{s.email || s.employeeCode || 'No email synced'}</Typography>
                                                        </Box>
                                                    </Stack>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="700" color="#FFF">{String(s.role || 'STAFF').toUpperCase()}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{s.specialization || s.trade || 'N/A'}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" color="#FFF">{s.baseZone || s.emirate || 'Global'}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Stack direction="row" spacing={1} alignItems="center">
                                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getStatusColor(s.status || 'ACTIVE') }} />
                                                        <Typography variant="caption" fontWeight="950" sx={{ color: getStatusColor(s.status || 'ACTIVE') }}>
                                                            {(s.status || 'ACTIVE').toUpperCase()}
                                                        </Typography>
                                                    </Stack>
                                                </TableCell>
                                                <TableCell sx={{ minWidth: 190 }}>
                                                    <Stack spacing={1}>
                                                        <Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="textSecondary">Dispatch / HR</Typography><Typography variant="caption" color="#FFF" fontWeight="900">{readiness.score}%</Typography></Stack>
                                                        <LinearProgress variant="determinate" value={readiness.score} sx={{ height: 7, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: readiness.score >= 85 ? '#10b981' : readiness.score >= 60 ? '#eab308' : '#ef4444' } }} />
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{readiness.missing} missing · {readiness.expired} expired</Typography>
                                                    </Stack>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="900" color="#10b981">{s.wpsStatus || s.payrollStatus || 'ACTIVE'}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{formatMoney(s.grossSalary || s.salary || s.salaryPackage?.grossSalary)}</Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                                                        {isHRManager && (
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                startIcon={generatingId === s.id ? <CircularProgress size={14} /> : <FileText size={14} />}
                                                                disabled={generatingId !== null}
                                                                onClick={() => handleGeneratePayslip(s)}
                                                                sx={{ borderColor: alpha(binThemeTokens.gold, 0.3), color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.7rem' }}
                                                            >
                                                                PAYSLIP
                                                            </Button>
                                                        )}
                                                        <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.3)' }}>
                                                            <ChevronRight size={18} />
                                                        </IconButton>
                                                    </Stack>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}

                {tab === 2 && (
                    <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={2} sx={{ mb: 3 }}>
                            <Box>
                                <Typography variant="h6" fontWeight="950" color="#FFF">STAFF REQUESTS QUEUE</Typography>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)' }}>Review paperless HR cases submitted from technician/staff portals and the multilingual AI router.</Typography>
                            </Box>
                            <FormControl size="small" sx={{ minWidth: 240 }}>
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.55)' }}>Filter</InputLabel>
                                <Select value={requestFilter} label="Filter" onChange={(event) => setRequestFilter(String(event.target.value))} sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.04)' }}>
                                    <MenuItem value="all">All visible requests</MenuItem>
                                    <MenuItem value="pending_hr_review">Pending HR review</MenuItem>
                                    <MenuItem value="urgent">Urgent priority</MenuItem>
                                    <MenuItem value="high">High priority</MenuItem>
                                    <MenuItem value="payroll">Payroll</MenuItem>
                                    <MenuItem value="leave">Leave</MenuItem>
                                    <MenuItem value="safety">Safety</MenuItem>
                                    <MenuItem value="confidential">Confidential</MenuItem>
                                </Select>
                            </FormControl>
                        </Stack>
                        <TableContainer>
                            <Table size="small">
                                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableRow>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>STAFF MEMBER</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>TYPE</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>DATES / HOURS</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>REASON</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>PRIORITY</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>STATUS</TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>CREATED</TableCell>
                                        <TableCell align="right" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>ACTIONS</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {visibleRequests.map((req) => {
                                        const isPayslip = req.requestType === 'payslip';
                                        const canReview = isHRManager || (isPayslip && isFinanceRole);
                                        const statusColor = REQUEST_STATUS_COLORS[req.status] || '#94a3b8';
                                        return (
                                            <TableRow key={req.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="900" color="#FFF">{req.displayName || 'Staff Member'}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{req.email || req.uid || 'No identity synced'}</Typography>
                                                </TableCell>
                                                <TableCell sx={{ color: binThemeTokens.gold, textTransform: 'uppercase', fontWeight: 900, fontSize: '0.75rem' }}>
                                                    {requestTitle(req.requestLabel || req.requestType)}
                                                    <Typography variant="caption" display="block" color="textSecondary">{req.source || 'paperless_staff_portal'}</Typography>
                                                </TableCell>
                                                <TableCell sx={{ color: '#FFF', fontSize: '0.75rem' }}>
                                                    {req.startDate || 'N/A'} to {req.endDate || 'N/A'}
                                                    {Number(req.hours || 0) > 0 && <Box component="span" sx={{ color: binThemeTokens.gold, ml: 1 }}>({req.hours} hrs)</Box>}
                                                </TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 300, fontSize: '0.75rem' }}>{req.reason || req.aiAnswer || 'No reason provided'}</TableCell>
                                                <TableCell>
                                                    <Chip size="small" label={String(req.priority || 'normal').toUpperCase()} sx={{ fontWeight: 900, fontSize: '0.65rem', bgcolor: req.priority === 'urgent' ? 'rgba(239,68,68,0.12)' : req.priority === 'high' ? 'rgba(234,179,8,0.12)' : 'rgba(16,185,129,0.1)', color: req.priority === 'urgent' ? '#ef4444' : req.priority === 'high' ? '#eab308' : '#10b981' }} />
                                                </TableCell>
                                                <TableCell><Chip label={String(req.status || 'pending_hr_review').replace(/_/g, ' ').toUpperCase()} size="small" sx={{ fontWeight: 900, bgcolor: alpha(statusColor, 0.12), color: statusColor, fontSize: '0.65rem' }} /></TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>{formatDate(req.createdAt)}</TableCell>
                                                <TableCell align="right">
                                                    {req.status === 'pending_hr_review' && canReview ? (
                                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                            {LETTER_REQUEST_TYPES.includes(req.requestType) ? (
                                                                <Button size="small" variant="contained" sx={{ fontSize: '0.65rem', fontWeight: 900, bgcolor: binThemeTokens.gold, color: '#000' }} onClick={() => handleOpenLetterDialog(req)}>ISSUE LETTER</Button>
                                                            ) : (
                                                                <Button size="small" variant="contained" color="success" sx={{ fontSize: '0.65rem', fontWeight: 900 }} onClick={() => { setReviewNote(''); setReviewDialog({ open: true, requestId: req.id, approve: true }); }}>APPROVE</Button>
                                                            )}
                                                            <Button size="small" variant="outlined" color="error" sx={{ fontSize: '0.65rem', fontWeight: 900 }} onClick={() => { setReviewNote(''); setReviewDialog({ open: true, requestId: req.id, approve: false }); }}>REJECT</Button>
                                                        </Stack>
                                                    ) : req.reviewNote ? (
                                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontStyle: 'italic' }}>Note: {req.reviewNote}</Typography>
                                                    ) : (
                                                        <Typography variant="caption" color="textSecondary">No action</Typography>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}

                {tab === 3 && (
                    <Grid container spacing={3}>
                        {heatStress.inSeason && (
                            <Grid item xs={12}>
                                <Alert
                                    severity={heatStress.inRestrictedWindowNow ? 'error' : 'warning'}
                                    icon={<Sun size={20} />}
                                    sx={{ borderRadius: 3 }}
                                >
                                    Heat-stress season active ({heatStress.seasonLabel}). Outdoor direct-sun work is banned {heatStress.windowLabel} daily{heatStress.inRestrictedWindowNow ? ' — restricted window is in effect right now.' : '.'} Confirm rosters exclude this window or record a supervisor exception.
                                </Alert>
                            </Grid>
                        )}
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
                                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                                    <Landmark color={binThemeTokens.gold} size={20} />
                                    <Typography variant="subtitle1" color="#FFF" fontWeight="950">Entity Profile</Typography>
                                </Stack>
                                <Typography variant="body2" color="#FFF" fontWeight="800">{BIN_GROUP_PRIMARY_ENTITY.legalNameEn}</Typography>
                                <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1.5 }}>{BIN_GROUP_PRIMARY_ENTITY.jurisdiction} · {BIN_GROUP_PRIMARY_ENTITY.workLocationEmirate}</Typography>
                                <Chip size="small" label={`${BIN_GROUP_PRIMARY_ENTITY.fieldsRequiringConfirmation.length} fields need confirmation`} sx={{ fontWeight: 900, bgcolor: 'rgba(234,179,8,0.12)', color: '#eab308', mb: 1.5 }} />
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', display: 'block' }}>{BIN_GROUP_PRIMARY_ENTITY.notes}</Typography>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
                                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                                    <UsersIcon color={binThemeTokens.gold} size={20} />
                                    <Typography variant="subtitle1" color="#FFF" fontWeight="950">Emiratisation</Typography>
                                </Stack>
                                {emiratisationStatus.applicable ? (
                                    <>
                                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                            <Typography variant="caption" color="textSecondary">Current / Required</Typography>
                                            <Typography variant="body2" fontWeight="950" color={emiratisationStatus.onTrack ? '#10b981' : '#ef4444'}>{emiratisationStatus.currentPct}% / {emiratisationStatus.requiredPct}%</Typography>
                                        </Stack>
                                        <LinearProgress variant="determinate" value={Math.min(100, (emiratisationStatus.currentPct / Math.max(emiratisationStatus.requiredPct, 1)) * 100)} sx={{ height: 7, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.08)', mb: 1.5, '& .MuiLinearProgress-bar': { bgcolor: emiratisationStatus.onTrack ? '#10b981' : '#ef4444' } }} />
                                        <Chip size="small" label={emiratisationStatus.onTrack ? 'On track' : `Gap: ${emiratisationStatus.gapPct}%`} sx={{ fontWeight: 900, bgcolor: emiratisationStatus.onTrack ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: emiratisationStatus.onTrack ? '#10b981' : '#ef4444', mb: 1.5 }} />
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', display: 'block' }}>{emiratisationStatus.note}</Typography>
                                    </>
                                ) : (
                                    <Typography variant="caption" color="textSecondary">{emiratisationStatus.note}</Typography>
                                )}
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
                                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                                    <ShieldCheck color={binThemeTokens.gold} size={20} />
                                    <Typography variant="subtitle1" color="#FFF" fontWeight="950">GPSSA Registration</Typography>
                                </Stack>
                                <Typography variant="body2" color="#FFF" fontWeight="800">{gpssaSummary.registeredCount} / {gpssaSummary.applicableCount} UAE national staff registered</Typography>
                                <Chip size="small" label={gpssaSummary.overdueCount > 0 ? `${gpssaSummary.overdueCount} overdue` : 'None overdue'} sx={{ mt: 1.5, fontWeight: 900, bgcolor: gpssaSummary.overdueCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', color: gpssaSummary.overdueCount > 0 ? '#ef4444' : '#10b981' }} />
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mt: 1.5 }}>Registration due ~30 working days from joining. Applies to UAE national staff only.</Typography>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} lg={4}>
                            <Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
                                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                                    <AlertTriangle color={binThemeTokens.gold} />
                                    <Typography variant="h6" color="#FFF" fontWeight="950">Compliance Risk Radar</Typography>
                                </Stack>
                                <Stack spacing={2}>
                                    {staff.slice(0, 12).map((s) => {
                                        const readiness = getStaffReadiness(s);
                                        return (
                                            <Box key={s.id}>
                                                <Stack direction="row" justifyContent="space-between" gap={2}>
                                                    <Typography variant="body2" color="#FFF" fontWeight="850">{s.displayName || s.fullName || s.email}</Typography>
                                                    <Typography variant="body2" color={readiness.score >= 85 ? '#10b981' : readiness.score >= 60 ? '#eab308' : '#ef4444'} fontWeight="950">{readiness.score}%</Typography>
                                                </Stack>
                                                <LinearProgress variant="determinate" value={readiness.score} sx={{ mt: 1, height: 6, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: readiness.score >= 85 ? '#10b981' : readiness.score >= 60 ? '#eab308' : '#ef4444' } }} />
                                            </Box>
                                        );
                                    })}
                                </Stack>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} lg={8}>
                            <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
                                <Typography variant="h6" color="#FFF" fontWeight="950" sx={{ mb: 3 }}>Document Expiry Matrix</Typography>
                                <Grid container spacing={2}>
                                    {staff.slice(0, 18).map((s) => (
                                        <Grid item xs={12} md={6} key={s.id}>
                                            <Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                                                <Typography variant="subtitle2" color="#FFF" fontWeight="900">{s.displayName || s.fullName || 'Staff Member'}</Typography>
                                                {['visaExpiry', 'emiratesIdExpiry', 'passportExpiry', 'medicalExpiry'].map((key) => {
                                                    const days = daysUntil(s[key]);
                                                    const color = days === null ? '#94a3b8' : days < 0 ? '#ef4444' : days <= 30 ? '#eab308' : '#10b981';
                                                    return (
                                                        <Stack key={key} direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                                                            <Typography variant="caption" color="textSecondary">{key.replace(/([A-Z])/g, ' $1').toUpperCase()}</Typography>
                                                            <Typography variant="caption" sx={{ color, fontWeight: 900 }}>{days === null ? 'Missing' : days < 0 ? `${Math.abs(days)}d expired` : `${days}d left`}</Typography>
                                                        </Stack>
                                                    );
                                                })}
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            </Paper>
                        </Grid>
                    </Grid>
                )}

                {tab === 4 && (
                    <Box sx={{ py: 1 }}>
                        <Grid container spacing={4}>
                            <Grid item xs={12} md={4}>
                                <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${binThemeTokens.gold}`, borderRadius: 4, textAlign: 'center' }}>
                                    <DollarSign size={48} color={binThemeTokens.gold} style={{ margin: '0 auto 16px' }} />
                                    <Typography variant="h5" fontWeight="950" color="#FFF">NEXT DISPATCH</Typography>
                                    <Typography variant="h3" fontWeight="950" color={binThemeTokens.gold} sx={{ my: 2 }}>{PAYROLL_PERIOD}</Typography>
                                    <Typography variant="body2" color="textSecondary">WPS-ready internal ledger · official API connection pending provider approval</Typography>
                                    <Button fullWidth variant="contained" sx={{ mt: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }} onClick={() => navigate('/admin/financials/payroll')}>
                                        OPEN LEDGER
                                    </Button>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} md={8}>
                                <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                                    <Typography variant="h6" fontWeight="950" sx={{ mb: 4 }} color="#FFF">PAYROLL READINESS</Typography>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>STAFF</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>GROSS PAY</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>WPS</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)' }}>PAYSLIP</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {staff.slice(0, 12).map((s) => (
                                                <TableRow key={s.id}>
                                                    <TableCell sx={{ fontWeight: 900, color: '#FFF' }}>{s.displayName || s.fullName || s.email}</TableCell>
                                                    <TableCell>{formatMoney(s.grossSalary || s.salary || s.salaryPackage?.grossSalary)}</TableCell>
                                                    <TableCell><Chip label={s.wpsStatus || s.payrollStatus || 'ACTIVE'} size="small" color="success" sx={{ fontWeight: 900, fontSize: 10 }} /></TableCell>
                                                    <TableCell><Button size="small" disabled={generatingId !== null || !isHRManager} onClick={() => handleGeneratePayslip(s)} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{generatingId === s.id ? 'SENDING...' : 'GENERATE'}</Button></TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </Paper>
                            </Grid>
                        </Grid>
                    </Box>
                )}

                {tab === 5 && (
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={5}>
                            <Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
                                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                                    <HeartPulse color={binThemeTokens.gold} />
                                    <Typography variant="h6" color="#FFF" fontWeight="950">Wellbeing Heatmap</Typography>
                                </Stack>
                                {moodCheckins.length === 0 ? <Typography color="rgba(255,255,255,0.5)">No mood check-ins synced yet.</Typography> : <Stack spacing={1.5}>{moodCheckins.slice(0, 20).map((entry) => <Paper key={entry.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction="row" justifyContent="space-between"><Box><Typography color="#FFF" fontWeight="900">{entry.displayName || entry.email || 'Staff Member'}</Typography><Typography variant="caption" color="textSecondary">{formatDate(entry.createdAt)} · {entry.source || 'paperless_staff_portal'}</Typography></Box><Chip size="small" label={`${entry.mood || 'unknown'} · ${entry.riskScore || 0}`} sx={{ fontWeight: 900, bgcolor: Number(entry.riskScore || 0) >= 70 ? 'rgba(234,179,8,0.12)' : 'rgba(16,185,129,0.1)', color: Number(entry.riskScore || 0) >= 70 ? '#eab308' : '#10b981' }} /></Stack></Paper>)}</Stack>}
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={7}>
                            <Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
                                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                                    <Bot color={binThemeTokens.gold} />
                                    <Typography variant="h6" color="#FFF" fontWeight="950">People AI Conversation Registry</Typography>
                                </Stack>
                                {aiConversations.length === 0 ? <Typography color="rgba(255,255,255,0.5)">No AI conversations synced yet.</Typography> : <Stack spacing={1.5}>{aiConversations.slice(0, 20).map((entry) => <Paper key={entry.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}><Stack direction="row" justifyContent="space-between" gap={2}><Box><Typography color="#FFF" fontWeight="900">{entry.displayName || entry.email || 'Staff Member'}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)' }}>{entry.question || entry.reason}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.gold }}>{entry.answer || entry.recommendedNextAction || 'Queued for HR review'}</Typography></Box><Chip size="small" label={requestTitle(entry.requestType || entry.category)} sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.1), fontWeight: 900 }} /></Stack></Paper>)}</Stack>}
                            </Paper>
                        </Grid>
                    </Grid>
                )}

                {tab === 6 && (
                    <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                            <Clock color={binThemeTokens.gold} />
                            <Typography variant="h6" color="#FFF" fontWeight="950">Sovereign HR Integration Roadmap</Typography>
                        </Stack>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', mb: 3 }}>
                            This screen separates what is already live inside BIN GROUP from integrations that require official credentials, legal structuring, or stronger privacy architecture before activation.
                        </Typography>
                        <Grid container spacing={2}>
                            {INTEGRATION_READINESS.map((item) => {
                                const color = item.tone === 'success' ? '#10b981' : item.tone === 'warning' ? '#eab308' : item.tone === 'error' ? '#ef4444' : binThemeTokens.gold;
                                return (
                                    <Grid item xs={12} md={6} key={item.name}>
                                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.025)', border: `1px solid ${alpha(color, 0.25)}`, borderRadius: 4 }}>
                                            <Stack direction="row" justifyContent="space-between" gap={2} alignItems="center">
                                                <Typography variant="subtitle1" color="#FFF" fontWeight="950">{item.name}</Typography>
                                                <Chip label={item.status} size="small" sx={{ bgcolor: alpha(color, 0.14), color, fontWeight: 900 }} />
                                            </Stack>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', mt: 1.5 }}>{item.note}</Typography>
                                        </Paper>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    </Paper>
                )}
            </Container>

            <Dialog
                open={Boolean(reviewDialog?.open)}
                onClose={() => { setReviewDialog(null); setReviewNote(''); }}
                PaperProps={{ sx: { bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, minWidth: 400 } }}
            >
                <DialogTitle sx={{ color: '#FFF', fontWeight: 950 }}>
                    {reviewDialog?.approve ? 'Approve Request' : 'Reject Request'}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        multiline
                        minRows={3}
                        label={reviewDialog?.approve ? 'Approval note (optional)' : 'Rejection reason (required)'}
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        sx={{ mt: 1, '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.55)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => { setReviewDialog(null); setReviewNote(''); }} sx={{ color: 'rgba(255,255,255,0.5)' }}>Cancel</Button>
                    <Button
                        variant="contained"
                        color={reviewDialog?.approve ? 'success' : 'error'}
                        disabled={!reviewDialog?.approve && !reviewNote.trim()}
                        onClick={() => { if (reviewDialog) handleReviewRequest(reviewDialog.requestId, reviewDialog.approve, reviewNote); }}
                        sx={{ fontWeight: 950 }}
                    >
                        {reviewDialog?.approve ? 'CONFIRM APPROVE' : 'CONFIRM REJECT'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
 feat/hr-self-service-letters-and-confidentiality
                open={Boolean(letterDialog?.open)}
                onClose={() => { if (!letterIssuing) { setLetterDialog(null); setLetterError(null); } }}
                PaperProps={{ sx: { bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, minWidth: 420 } }}
            >
                <DialogTitle sx={{ color: '#FFF', fontWeight: 950 }}>
                    Issue {requestTitle(letterDialog?.request?.requestType || '')}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 2 }}>
                        For {letterDialog?.request?.displayName || 'Staff Member'} ({letterDialog?.request?.email || 'no email on file'}). Generates a bilingual PDF from profile data on file — verify details before issuing to banks, embassies, or government authorities.
                    </Typography>
                    {letterDialog?.request?.requestType !== 'experience_letter' ? (
                        <TextField
                            autoFocus
                            fullWidth
                            label="Purpose (e.g. bank loan, visa application)"
                            value={letterPurpose}
                            onChange={(e) => setLetterPurpose(e.target.value)}
                            sx={{ mb: 2, '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.55)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                        />
                    ) : (
                        <TextField
                            fullWidth
                            type="date"
                            label="Last Working Date (leave blank if still employed)"
                            InputLabelProps={{ shrink: true }}
                            value={letterLastWorkingDate}
                            onChange={(e) => setLetterLastWorkingDate(e.target.value)}
                            sx={{ mb: 2, '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.55)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                        />
                    )}
                    {letterError && <Alert severity="error" sx={{ mb: 1 }}>{letterError}</Alert>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => { setLetterDialog(null); setLetterError(null); }} disabled={letterIssuing} sx={{ color: 'rgba(255,255,255,0.5)' }}>Cancel</Button>
                    <Button
                        variant="contained"
                        disabled={letterIssuing || (letterDialog?.request?.requestType !== 'experience_letter' && !letterPurpose.trim())}
                        onClick={handleIssueLetter}
                        sx={{ fontWeight: 950, bgcolor: binThemeTokens.gold, color: '#000' }}
                    >
                        {letterIssuing ? 'GENERATING…' : 'GENERATE & APPROVE'}
                    </Button>

                open={eosbDialogOpen}
                onClose={() => setEosbDialogOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 } }}
            >
                <DialogTitle sx={{ color: '#FFF', fontWeight: 950 }}>End-of-Service Benefit Estimator</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.5} sx={{ mt: 1 }}>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ color: 'rgba(255,255,255,0.55)' }}>Staff member (optional)</InputLabel>
                            <Select
                                value={eosbStaffId}
                                label="Staff member (optional)"
                                onChange={(e) => handleOpenEosbDialog(staff.find((s) => s.id === e.target.value))}
                                sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.04)' }}
                            >
                                <MenuItem value="">Manual entry</MenuItem>
                                {staff.map((s) => <MenuItem key={s.id} value={s.id}>{s.displayName || s.fullName || s.email}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField
                            label="Basic monthly salary (AED)"
                            type="number"
                            size="small"
                            fullWidth
                            value={eosbBasicSalary}
                            onChange={(e) => setEosbBasicSalary(e.target.value)}
                            sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.55)' } }}
                        />
                        <Stack direction="row" spacing={2}>
                            <TextField
                                label="Joining date"
                                type="date"
                                size="small"
                                fullWidth
                                value={eosbJoiningDate}
                                onChange={(e) => setEosbJoiningDate(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.55)' } }}
                            />
                            <TextField
                                label="Last working date"
                                type="date"
                                size="small"
                                fullWidth
                                value={eosbLastWorkingDate}
                                onChange={(e) => setEosbLastWorkingDate(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.55)' } }}
                            />
                        </Stack>
                        <FormControl size="small" fullWidth>
                            <InputLabel sx={{ color: 'rgba(255,255,255,0.55)' }}>Separation type</InputLabel>
                            <Select
                                value={eosbReason}
                                label="Separation type"
                                onChange={(e) => setEosbReason(e.target.value as EosbTerminationReason)}
                                sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.04)' }}
                            >
                                <MenuItem value="resignation">Resignation</MenuItem>
                                <MenuItem value="employer_terminated">Employer-terminated</MenuItem>
                                <MenuItem value="contract_end">Contract end / non-renewal</MenuItem>
                                <MenuItem value="death_or_disability">Death or disability</MenuItem>
                            </Select>
                        </FormControl>

                        {eosbResult && (
                            <Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`, borderRadius: 3 }}>
                                <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>ESTIMATED GRATUITY</Typography>
                                <Typography variant="h4" fontWeight="950" color={binThemeTokens.gold} sx={{ my: 1 }}>AED {eosbResult.finalEstimateAed.toLocaleString()}</Typography>
                                <Stack spacing={0.5} sx={{ mb: 1.5 }}>
                                    <Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="textSecondary">Service period</Typography><Typography variant="caption" color="#FFF">{eosbResult.serviceYears} years</Typography></Stack>
                                    <Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="textSecondary">Daily rate</Typography><Typography variant="caption" color="#FFF">AED {eosbResult.dailyRateAed}</Typography></Stack>
                                    <Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="textSecondary">Raw calculated gratuity</Typography><Typography variant="caption" color="#FFF">AED {eosbResult.rawGratuityAed.toLocaleString()}</Typography></Stack>
                                    {eosbResult.capApplied && <Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="textSecondary">2-year wage cap applied</Typography><Typography variant="caption" color="#eab308">AED {eosbResult.capAed.toLocaleString()}</Typography></Stack>}
                                </Stack>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', display: 'block', mb: 1.5 }}>{eosbResult.note}</Typography>
                                <Alert severity="warning" sx={{ fontSize: '0.75rem' }}>{eosbResult.disclaimer}</Alert>
                            </Paper>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setEosbDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>Close</Button>
 main
                </DialogActions>
            </Dialog>
        </Box>
    );
}
