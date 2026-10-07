import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography,
    alpha,
} from '@mui/material';
import { Mail, MapPin, Phone, Plus, Search, Users } from 'lucide-react';
import {
    collection,
    db,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { logAuditAction } from '../../utils/auditLogger';
import BrokerPageFrame from '../components/BrokerPageFrame';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const clean = (value: unknown) => String(value || '').trim();

// Lead contact checks. Phone and email stay optional, but if given they must be real.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normaliseUaePhone = (value: string) => value.replace(/[\s()-]/g, '');
const UAE_PHONE_PATTERN = /^(\+971|00971|0)?5\d{8}$|^(\+971|00971|0)?[2-9]\d{7}$/;
const leadFieldErrors = (input: { leadName: string; phone: string; email: string; budget: string }, isRTL = false) => {
    const errors: Partial<Record<'leadName' | 'phone' | 'email' | 'budget', string>> = {};
    if ((input.leadName.match(/\p{L}/gu) || []).length < 2) errors.leadName = isRTL ? 'أدخل اسم العميل' : 'Enter the client name';
    if (input.phone.trim() && !UAE_PHONE_PATTERN.test(normaliseUaePhone(input.phone.trim()))) errors.phone = isRTL ? 'أدخل رقم هاتف إماراتي (+971…)' : 'Enter a UAE phone number (+971…)';
    if (input.email.trim() && !EMAIL_PATTERN.test(input.email.trim())) errors.email = isRTL ? 'أدخل بريدًا إلكترونيًا صحيحًا' : 'Enter a valid email';
    if (input.budget.trim() && !/^[\d,.\s]+(k|m)?$/i.test(input.budget.trim())) errors.budget = isRTL ? 'أدخل مبلغًا بالأرقام' : 'Enter an amount in numbers';
    return errors;
};

const numericAmount = (value: unknown) => {
    const raw = String(value || '').replace(/[^0-9.]/g, '');
    const amount = Number(raw || 0);
    return Number.isFinite(amount) ? amount : 0;
};

type BrokerLeadsPageProps = {
    openFormByDefault?: boolean;
};

type Notice = { severity: 'success' | 'error' | 'warning' | 'info'; message: string } | null;

export default function BrokerLeadsPage({ openFormByDefault = false }: BrokerLeadsPageProps) {
    const { user } = useRole();
    const { isRTL } = useLanguage();
    const navigate = useNavigate();
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [openAdd, setOpenAdd] = useState(openFormByDefault);
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState<Notice>(null);

    const [leadName, setLeadName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [leadType, setLeadType] = useState('owner');
    const [propertyInterest, setPropertyInterest] = useState('');
    const [location, setLocation] = useState('');
    const [budget, setBudget] = useState('');
    const [showErrors, setShowErrors] = useState(false);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        setOpenAdd(openFormByDefault);
    }, [openFormByDefault]);

    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return () => undefined;
        }

        const leadsQuery = query(
            collection(db, 'brokerLeads'),
            where('brokerId', '==', user.uid),
            orderBy('createdAt', 'desc'),
        );

        const unsubscribe = onSnapshot(leadsQuery, (snapshot) => {
            setLeads(snapshot.docs
                .map((row) => ({ id: row.id, ...row.data() }))
                .filter((lead: any) => String(lead.status || '').toLowerCase() !== 'archived'));
            setLoading(false);
        }, (error) => {
            console.error('[BrokerLeads] listener failed:', error);
            setNotice({ severity: 'error', message: error?.message || 'Unable to load broker leads.' });
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.uid]);

    const filteredLeads = useMemo(() => {
        const needle = searchTerm.trim().toLowerCase();
        if (!needle) return leads;
        return leads.filter((lead) => [lead.leadName, lead.propertyInterest, lead.location, lead.attributionId]
            .some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [leads, searchTerm]);

    const resetForm = () => {
        setShowErrors(false);
        setLeadName('');
        setPhone('');
        setEmail('');
        setLeadType('owner');
        setPropertyInterest('');
        setLocation('');
        setBudget('');
        setNotes('');
    };

    const fieldErrors = leadFieldErrors({ leadName, phone, email, budget }, isRTL);

    const handleAddLead = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!user?.uid || !leadName.trim()) return;
        setShowErrors(true);
        if (Object.keys(leadFieldErrors({ leadName, phone, email, budget }, isRTL)).length) return;

        setSubmitting(true);
        setNotice(null);
        try {
            const budgetAmount = numericAmount(budget);
            const brokerId = user.uid;
            const leadPayload = {
                attributionSource: 'BROKER_PORTAL_LEAD',
                sourceChannel: 'broker_portal',
                brokerId,
                brokerUid: brokerId,
                brokerEmail: normalizeEmail(user.email),
                brokerName: clean(user.displayName || user.email || 'Broker Partner'),
                broughtByRole: 'broker',
                broughtByUid: brokerId,
                broughtByEmail: normalizeEmail(user.email),
                leadName: clean(leadName),
                phone: clean(phone),
                email: normalizeEmail(email),
                leadType: clean(leadType).toLowerCase() || 'owner',
                leadCategory: clean(leadType).toLowerCase() || 'owner',
                propertyInterest: clean(propertyInterest),
                location: clean(location),
                budget: clean(budget),
                budgetAmount,
                notes: clean(notes),
                attributionProof: {
                    leadName: clean(leadName),
                    phone: clean(phone),
                    email: normalizeEmail(email),
                    propertyInterest: clean(propertyInterest),
                    location: clean(location),
                    budget: clean(budget),
                    capturedFrom: 'broker_leads_page',
                },
                status: 'new',
                lifecycleStatus: 'LEAD_CAPTURED',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };

            const leadRef = doc(collection(db, 'brokerLeads'));
            const attributionId = `broker_lead_${brokerId}_${leadRef.id}`;
            await setDoc(leadRef, {
                ...leadPayload,
                attributionId,
                sourceLeadId: leadRef.id,
            });

            await logAuditAction({
                action: 'BROKER_LEAD_CREATED',
                targetType: 'BROKER_LEAD',
                targetId: leadRef.id,
                metadata: {
                    module: 'broker_leads',
                    attributionId,
                    leadType: leadPayload.leadType,
                    leadName: leadPayload.leadName,
                    propertyInterest: leadPayload.propertyInterest,
                    location: leadPayload.location,
                    budgetAmount,
                },
            });

            setOpenAdd(false);
            resetForm();
            setNotice({ severity: 'success', message: `Lead recorded with attribution ${attributionId}.` });
        } catch (error: any) {
            console.error('[BrokerLeads] create failed:', error);
            setNotice({ severity: 'error', message: error?.message || 'Lead could not be submitted.' });
        } finally {
            setSubmitting(false);
        }
    };

    const updateLeadStatus = async (lead: any, newStatus: string) => {
        const leadId = String(lead?.id || '');
        if (!leadId) return;
        if (!['new', 'contacted', 'viewing', 'negotiation', 'rejected'].includes(newStatus)) {
            setNotice({
                severity: 'error',
                message: 'Lead conversion is completed by BIN GROUP after server-side attribution and contract approval.',
            });
            return;
        }

        setNotice(null);
        try {
            const statusPayload: Record<string, any> = {
                status: newStatus,
                lifecycleStatus: `LEAD_${String(newStatus).toUpperCase()}`,
                updatedAt: serverTimestamp(),
            };

            await updateDoc(doc(db, 'brokerLeads', leadId), statusPayload);
            await logAuditAction({
                action: 'BROKER_LEAD_STATUS_UPDATED',
                targetType: 'BROKER_LEAD',
                targetId: leadId,
                metadata: {
                    module: 'broker_leads',
                    attributionId: lead.attributionId || `broker_lead_${user?.uid}_${leadId}`,
                    previousStatus: lead.status,
                    newStatus,
                },
            });
        } catch (error: any) {
            console.error('[BrokerLeads] status update failed:', error);
            setNotice({ severity: 'error', message: error?.message || 'Lead status could not be updated.' });
        }
    };

    const statusColor = (status: string) => {
        switch (String(status || '').toLowerCase()) {
            case 'new': return '#2563EB';
            case 'contacted': return binThemeTokens.gold;
            case 'viewing': return '#7C3AED';
            case 'negotiation': return '#D97706';
            case 'converted': return '#059669';
            case 'rejected': return '#DC2626';
            default: return '#667085';
        }
    };

    return (
        <BrokerPageFrame
            title="Leads Pipeline"
            subtitle="Capture owner, tenant, property, and corporate opportunities with immutable broker attribution."
            loading={loading}
            showBack={openFormByDefault}
            actions={(
                <Button
                    data-testid="broker-submit-lead"
                    variant="contained"
                    startIcon={<Plus size={18} />}
                    onClick={() => setOpenAdd(true)}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 3, py: 1.3, borderRadius: 3 }}
                >
                    ADD NEW LEAD
                </Button>
            )}
        >
            {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 3 }}>{notice.message}</Alert>}

            <Paper sx={{ p: 2, mb: 4, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 4 }}>
                <TextField
                    fullWidth
                    placeholder="Search leads by name, requirement, location, or attribution ID"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    InputProps={{ startAdornment: <Search size={18} style={{ marginRight: 10 }} /> }}
                />
            </Paper>

            {filteredLeads.length === 0 ? (
                <Paper sx={{ p: 8, textAlign: 'center', bgcolor: '#F8F9FB', borderRadius: 5, border: '1px dashed #D1D5DB' }}>
                    <Users size={44} color="#9CA3AF" />
                    <Typography variant="h6" sx={{ mt: 2, color: '#667085', fontWeight: 900 }}>NO ACTIVE LEADS IN PIPELINE</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {filteredLeads.map((lead) => {
                        const tone = statusColor(lead.status);
                        return (
                            <Grid item xs={12} md={6} lg={4} key={lead.id}>
                                <Paper data-testid="broker-lead-card" sx={{ p: 3, height: '100%', bgcolor: '#FFFFFF', borderRadius: 4, border: `1px solid ${alpha(tone, 0.25)}` }}>
                                    <Stack spacing={2}>
                                        <Stack direction="row" justifyContent="space-between" spacing={1}>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="h6" sx={{ color: '#111827', fontWeight: 950, overflowWrap: 'anywhere' }}>{lead.leadName}</Typography>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, overflowWrap: 'anywhere' }}>{lead.attributionId || 'ATTRIBUTION PENDING'}</Typography>
                                            </Box>
                                            <Chip size="small" label={String(lead.status || 'new').toUpperCase()} sx={{ bgcolor: alpha(tone, 0.1), color: tone, fontWeight: 950 }} />
                                        </Stack>

                                        <Stack spacing={0.8}>
                                            <Typography variant="body2" sx={{ color: '#667085', display: 'flex', gap: 1 }}><Phone size={14} /> {lead.phone || 'No phone'}</Typography>
                                            <Typography variant="body2" sx={{ color: '#667085', display: 'flex', gap: 1 }}><Mail size={14} /> {lead.email || 'No email'}</Typography>
                                            <Typography variant="body2" sx={{ color: '#667085', display: 'flex', gap: 1 }}><MapPin size={14} /> {lead.location || 'Location not supplied'}</Typography>
                                        </Stack>

                                        <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800 }}>{lead.propertyInterest || 'General property opportunity'}</Typography>

                                        <TextField
                                            select
                                            size="small"
                                            label="Lead Status"
                                            value={lead.status || 'new'}
                                            onChange={(event) => updateLeadStatus(lead, event.target.value)}
                                        >
                                            <MenuItem value="new">NEW</MenuItem>
                                            <MenuItem value="contacted">CONTACTED</MenuItem>
                                            <MenuItem value="viewing">VIEWING</MenuItem>
                                            <MenuItem value="negotiation">NEGOTIATION</MenuItem>
                                            <MenuItem value="rejected">REJECTED</MenuItem>
                                        </TextField>
                                    </Stack>
                                </Paper>
                            </Grid>
                        );
                    })}
                </Grid>
            )}

            <Dialog
                open={openAdd}
                onClose={() => !submitting && setOpenAdd(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { bgcolor: '#FFFFFF', color: '#111827', borderRadius: 5, border: '1px solid rgba(201,166,70,0.28)' } }}
            >
                <form onSubmit={handleAddLead}>
                    <DialogTitle sx={{ color: '#7A5C12', fontWeight: 950 }}>{isRTL ? 'تسجيل عميل جديد' : 'Register new lead'}</DialogTitle>
                    <DialogContent>
                        <Stack spacing={2.2} sx={{ pt: 1 }}>
                            <TextField inputProps={{ 'data-testid': 'broker-lead-client-name', autoComplete: 'name' }} fullWidth required label={isRTL ? 'الاسم الكامل للعميل' : 'Client full name'} value={leadName} onChange={(event) => setLeadName(event.target.value)} error={showErrors && Boolean(fieldErrors.leadName)} helperText={showErrors ? fieldErrors.leadName : undefined} />
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}><TextField fullWidth type="tel" inputProps={{ inputMode: 'tel', autoComplete: 'tel', 'data-testid': 'broker-lead-phone' }} label={isRTL ? 'رقم الهاتف' : 'Phone number'} placeholder="+971 5X XXX XXXX" value={phone} onChange={(event) => setPhone(event.target.value)} error={showErrors && Boolean(fieldErrors.phone)} helperText={showErrors ? fieldErrors.phone : undefined} /></Grid>
                                <Grid item xs={12} sm={6}><TextField fullWidth type="email" inputProps={{ inputMode: 'email', autoComplete: 'email', 'data-testid': 'broker-lead-email' }} label={isRTL ? 'البريد الإلكتروني' : 'Email address'} value={email} onChange={(event) => setEmail(event.target.value)} error={showErrors && Boolean(fieldErrors.email)} helperText={showErrors ? fieldErrors.email : undefined} /></Grid>
                            </Grid>
                            <TextField select fullWidth label="Lead Category" value={leadType} onChange={(event) => setLeadType(event.target.value)}>
                                <MenuItem value="owner">Property Owner</MenuItem>
                                <MenuItem value="tenant">Tenant</MenuItem>
                                <MenuItem value="property">Property Asset</MenuItem>
                                <MenuItem value="company">Corporate / Holding</MenuItem>
                            </TextField>
                            <TextField inputProps={{ 'data-testid': 'broker-lead-property-interest' }} fullWidth label="Property Interest / Requirement" value={propertyInterest} onChange={(event) => setPropertyInterest(event.target.value)} />
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}><TextField fullWidth label="Location / Emirate" value={location} onChange={(event) => setLocation(event.target.value)} /></Grid>
                                <Grid item xs={12} sm={6}><TextField fullWidth inputProps={{ inputMode: 'decimal', 'data-testid': 'broker-lead-budget' }} label={isRTL ? 'الميزانية (درهم)' : 'Budget (AED)'} value={budget} onChange={(event) => setBudget(event.target.value)} error={showErrors && Boolean(fieldErrors.budget)} helperText={showErrors ? fieldErrors.budget : undefined} /></Grid>
                            </Grid>
                            <TextField fullWidth multiline rows={3} label={isRTL ? 'ملاحظات' : 'Notes'} value={notes} onChange={(event) => setNotes(event.target.value)} />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ p: 3 }}>
                        <Button aria-label={isRTL ? 'رجوع' : 'Back'} onClick={() => { setOpenAdd(false); if (openFormByDefault) navigate('/broker/leads'); }} disabled={submitting} sx={{ color: '#344054', minHeight: 44 }}>{isRTL ? 'رجوع' : 'Back'}</Button>
                        <Button data-testid="broker-lead-submit" type="submit" variant="contained" disabled={submitting || !leadName.trim()} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950, minHeight: 44 }}>
                            {submitting ? <CircularProgress size={20} color="inherit" /> : (isRTL ? 'حفظ العميل' : 'Save lead')}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </BrokerPageFrame>
    );
}
