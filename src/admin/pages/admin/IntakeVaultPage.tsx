import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import {
  Calendar,
  CheckCircle,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  ShieldCheck,
  UserPlus,
  Wrench,
  XCircle,
} from 'lucide-react';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, auth, functions, httpsCallable } from '@/lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

interface IntakeSubmission {
  id: string;
  userId?: string;
  ownerUid?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerMobile?: string;
  ownerRegistrationId?: string;
  pendingOwnerId?: string;
  status?: string;
  source?: string;
  createdAt?: any;
  updatedAt?: any;
  contactInfo?: any;
  properties?: any[];
  portfolioSummary?: any;
  payment?: any;
  pricing?: any;
  selectedPlan?: any;
  contractType?: string;
  selectedAddOns?: any[];
  proofDocuments?: any;
  proofDocumentMetadata?: any;
  kycUrls?: any;
  pendingPaymentSubmission?: any;
  latestPaymentSubmission?: any;
  paymentStatus?: string;
  paymentVerified?: boolean;
  documentsVerified?: boolean;
  locationVerified?: boolean;
  adminReviewState?: string;
  activationState?: string;
  activeContractId?: string;
}

const callable = <T = any, R = any>(name: string) => httpsCallable<T, R>(functions, name);

const adminSendOwnerOnboardingMessage = callable('adminSendOwnerOnboardingMessage');
const adminCreateOwnerPropertyInspection = callable('adminCreateOwnerPropertyInspection');
const approveOwnerSubmissionOperationalFlow = callable('approveOwnerSubmissionOperationalFlow');

const asNumber = (value: any): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const safeDate = (value: any) => {
  if (!value) return 'Recent';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : 'Recent';
};

const money = (value: any) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

const readOwner = (raw: IntakeSubmission) => {
  const pending = raw.pendingPaymentSubmission || raw.latestPaymentSubmission || {};
  const account = pending.ownerAccount || raw.ownerUid || {};
  const company = pending.companyProfile || {};
  const contact = raw.contactInfo || {};
  return {
    name: String(raw.ownerName || contact.name || account.fullName || account.name || company.name || company.contactPerson || 'Pending Owner').trim(),
    email: String(raw.ownerEmail || contact.email || account.email || company.email || '').trim().toLowerCase(),
    mobile: String(raw.ownerMobile || contact.phone || account.mobile || account.phone || company.phone || '').trim(),
  };
};

const readProperties = (raw: IntakeSubmission) => {
  const pending = raw.pendingPaymentSubmission || raw.latestPaymentSubmission || {};
  if (Array.isArray(raw.properties) && raw.properties.length) return raw.properties;
  if (Array.isArray(pending.properties) && pending.properties.length) return pending.properties;
  return [];
};

const readProofDocuments = (raw: IntakeSubmission) => {
  const pending = raw.pendingPaymentSubmission || raw.latestPaymentSubmission || {};
  return raw.proofDocuments || raw.proofDocumentMetadata || pending.proofDocuments || pending.proofDocumentMetadata || {};
};

const readPayment = (raw: IntakeSubmission) => {
  const pending = raw.pendingPaymentSubmission || raw.latestPaymentSubmission || {};
  const payment = raw.payment || pending.payment || {};
  const pricing = raw.pricing || pending.pricing || {};
  const summary = raw.portfolioSummary || pending.portfolioSummary || {};
  const annualValue = Number(pricing.annualContractValue || summary.estimatedACV || payment.annualValue || 0);
  const mobilization = Number(payment.amount || pricing.mobilizationAmount || Math.round(annualValue * 0.15));
  return {
    ...payment,
    method: String(payment.method || raw.payment?.method || 'MANUAL').toUpperCase(),
    amount: Number.isFinite(mobilization) ? mobilization : 0,
    annualValue: Number.isFinite(annualValue) ? annualValue : 0,
    status: String(raw.paymentStatus || payment.status || 'PENDING').toUpperCase(),
  };
};

const readPlan = (raw: IntakeSubmission) => {
  const pending = raw.pendingPaymentSubmission || raw.latestPaymentSubmission || {};
  const plan = raw.selectedPlan || pending.selectedPlan || {};
  const summary = raw.portfolioSummary || pending.portfolioSummary || {};
  return {
    raw: plan,
    name: String(plan.name || plan.packageName || summary.recommendedTier || 'Institutional Package').trim(),
    type: String(plan.id || plan.type || raw.contractType || 'hybrid').trim(),
  };
};

const normalizeIntake = (raw: IntakeSubmission): IntakeSubmission => {
  const pending = raw.pendingPaymentSubmission || raw.latestPaymentSubmission || {};
  const owner = readOwner(raw);
  const payment = readPayment(raw);
  return {
    ...raw,
    ownerName: owner.name,
    ownerEmail: owner.email,
    ownerMobile: owner.mobile,
    properties: readProperties(raw),
    proofDocuments: readProofDocuments(raw),
    payment,
    pricing: raw.pricing || pending.pricing || {},
    selectedPlan: raw.selectedPlan || pending.selectedPlan || null,
    selectedAddOns: Array.isArray(raw.selectedAddOns) ? raw.selectedAddOns : (Array.isArray(pending.selectedAddOns) ? pending.selectedAddOns : []),
    portfolioSummary: raw.portfolioSummary || pending.portfolioSummary || {},
    createdAt: raw.createdAt || raw.updatedAt || pending.submittedAt,
    status: raw.status || 'AWAITING_VERIFICATION',
    paymentStatus: raw.paymentStatus || payment.status || 'PENDING',
    paymentVerified: Boolean(raw.paymentVerified || raw.paymentStatus === 'VERIFIED' || raw.paymentStatus === 'RECONCILED' || payment.status === 'VERIFIED'),
    documentsVerified: Boolean(raw.documentsVerified),
    locationVerified: Boolean(raw.locationVerified),
    adminReviewState: raw.adminReviewState || pending.adminReviewState || 'AWAITING_VERIFICATION',
  };
};

const HIDDEN_INTAKE_STATUSES = new Set([
  'CONVERTED_TO_OWNER',
  'APPROVED',
  'ACTIVE',
  'REJECTED',
  'ARCHIVED',
  'CANCELLED'
]);

const HIDDEN_ADMIN_STATES = new Set([
  'ARCHIVED_BY_ADMIN_CLEANUP',
  'REJECTED_NEEDS_CLARIFICATION'
]);

const isVisibleOwnerVerification = (intake: IntakeSubmission) => {
  const status = String(intake.status || '').trim().toUpperCase();
  const adminState = String(intake.adminReviewState || '').trim().toUpperCase();

  if (HIDDEN_INTAKE_STATUSES.has(status)) return false;
  if (HIDDEN_ADMIN_STATES.has(adminState)) return false;
  if (adminState.includes('ARCHIVED')) return false;

  return true;
};


const extractLatLng = (property: any) => {
  const lat = asNumber(property?.geo?.lat ?? property?.geo?.latitude ?? property?.location?.lat ?? property?.location?.latitude ?? property?.coordinates?.lat ?? property?.coordinates?.latitude ?? property?.lat ?? property?.latitude);
  const lng = asNumber(property?.geo?.lng ?? property?.geo?.longitude ?? property?.location?.lng ?? property?.location?.longitude ?? property?.coordinates?.lng ?? property?.coordinates?.longitude ?? property?.lng ?? property?.longitude);
  return lat !== null && lng !== null ? { lat, lng } : null;
};

const propertyAddress = (property: any) => property?.propertyName || property?.addressLine || property?.address || property?.locationAddress || property?.name || 'Property Node';
const emirateLabel = (property: any) => property?.emirate || property?.city || property?.area || 'UAE';

const buildMapsSearchUrl = (property: any) => {
  const gps = extractLatLng(property);
  const query = gps ? `${gps.lat},${gps.lng}` : `${propertyAddress(property)} ${emirateLabel(property)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

const buildMapsDirectionsUrl = (property: any) => {
  const gps = extractLatLng(property);
  const destination = gps ? `${gps.lat},${gps.lng}` : `${propertyAddress(property)} ${emirateLabel(property)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
};

const openExternal = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

const copyText = async (text: string) => {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement('textarea');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
};

export const IntakeVaultPage: React.FC = () => {
  const [submissions, setSubmissions] = useState<IntakeSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIntake, setSelectedIntake] = useState<IntakeSubmission | null>(null);
  const [clarificationNote, setClarificationNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'error' | 'info' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'intake_submissions'), (snapshot) => {
      const docs = snapshot.docs
        .map((entry) => normalizeIntake({ id: entry.id, ...entry.data() } as IntakeSubmission))
        .filter(isVisibleOwnerVerification)
        .sort((a, b) => getMillis(b.createdAt || b.updatedAt) - getMillis(a.createdAt || a.updatedAt));
      setSubmissions(docs);
      setLoading(false);
    }, (error) => {
      console.error('Failed to load intake submissions:', error);
      setNotice({ severity: 'error', text: 'Could not load owner verification inbox. Check Admin permissions.' });
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const selected = useMemo(() => selectedIntake ? normalizeIntake(selectedIntake) : null, [selectedIntake]);

  const syncSelected = (patch: Partial<IntakeSubmission>) => {
    setSelectedIntake((current) => current ? normalizeIntake({ ...current, ...patch } as IntakeSubmission) : current);
  };

  const updateIntakeFlags = async (intake: IntakeSubmission, patch: Record<string, any>, success: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await updateDoc(doc(db, 'intake_submissions', intake.id), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
      syncSelected(patch as Partial<IntakeSubmission>);
      setNotice({ severity: 'success', text: success });
    } catch (error) {
      console.error('Owner verification flag update failed:', error);
      setNotice({ severity: 'error', text: 'Could not update verification flag. Check Admin Firestore write permission.' });
    } finally {
      setBusy(false);
    }
  };

  const handlePaymentVerified = (intake: IntakeSubmission) => updateIntakeFlags(intake, {
    paymentStatus: 'VERIFIED',
    paymentVerified: true,
    paymentState: 'PAYMENT_VERIFIED',
    paymentVerifiedAt: serverTimestamp(),
    paymentVerifiedBy: auth.currentUser?.uid || 'ADMIN_HUB',
  }, 'Payment marked verified.');

  const handleDocumentsVerified = (intake: IntakeSubmission) => updateIntakeFlags(intake, {
    documentsVerified: true,
    documentsVerifiedAt: serverTimestamp(),
    documentsVerifiedBy: auth.currentUser?.uid || 'ADMIN_HUB',
  }, 'Documents marked verified.');

  const handleLocationVerified = (intake: IntakeSubmission) => updateIntakeFlags(intake, {
    locationVerified: true,
    locationVerifiedAt: serverTimestamp(),
    locationVerifiedBy: auth.currentUser?.uid || 'ADMIN_HUB',
  }, 'Property location marked verified.');

  const handleContactOwner = async (intake: IntakeSubmission) => {
    const message = clarificationNote.trim() || 'Please contact BIN GROUP Admin to complete payment/document verification for your property onboarding.';
    setBusy(true);
    setNotice(null);
    try {
      await adminSendOwnerOnboardingMessage({
        intakeId: intake.id,
        subject: 'BIN GROUP onboarding verification update',
        message,
      });
      setNotice({ severity: 'success', text: 'Owner message and email have been queued.' });
    } catch (error) {
      console.error('Contact owner failed:', error);
      setNotice({ severity: 'error', text: 'Could not contact owner. Check callable deployment and Admin role.' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateInspection = async (intake: IntakeSubmission) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await adminCreateOwnerPropertyInspection({ intakeId: intake.id, propertyIndex: 0 });
      const data = result.data as any;
      setNotice({ severity: 'success', text: `Site inspection created. Dispatch job: ${data?.dispatchJobId || 'created'}.` });
      if (data?.directionsUrl) openExternal(data.directionsUrl);
    } catch (error) {
      console.error('Create owner inspection failed:', error);
      setNotice({ severity: 'error', text: 'Could not create property inspection. Verify that property GPS exists.' });
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (intake: IntakeSubmission) => {
    const note = clarificationNote.trim();
    if (!note) {
      setNotice({ severity: 'warning', text: 'Add a clarification/rejection note first.' });
      return;
    }
    if (!window.confirm('Reject this owner submission and send/request clarification?')) return;
    setBusy(true);
    setNotice(null);
    try {
      await updateDoc(doc(db, 'intake_submissions', intake.id), {
        status: 'REJECTED',
        adminReviewState: 'REJECTED_NEEDS_CLARIFICATION',
        rejectionNote: note,
        rejectedAt: serverTimestamp(),
        rejectedBy: auth.currentUser?.uid || 'ADMIN_HUB',
        updatedAt: serverTimestamp(),
      });
      await adminSendOwnerOnboardingMessage({
        intakeId: intake.id,
        subject: 'BIN GROUP onboarding clarification required',
        message: note,
      });
      setSelectedIntake(null);
      setClarificationNote('');
      setNotice({ severity: 'success', text: 'Clarification request sent to owner.' });
    } catch (error) {
      console.error('Reject owner submission failed:', error);
      setNotice({ severity: 'error', text: 'Could not reject/send clarification. Check Admin permissions.' });
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (intake: IntakeSubmission) => {
    const normalized = normalizeIntake(intake);
    const missing: string[] = [];
    if (!normalized.paymentVerified && normalized.paymentStatus !== 'VERIFIED' && normalized.paymentStatus !== 'RECONCILED') missing.push('payment');
    if (!normalized.documentsVerified) missing.push('documents');
    if (!normalized.locationVerified) missing.push('property location');
    if (missing.length && !window.confirm(`These checks are not marked verified: ${missing.join(', ')}. Continue only if Admin has verified them offline.`)) return;

    setBusy(true);
    setNotice(null);
    try {
      const result = await approveOwnerSubmissionOperationalFlow({ intakeId: normalized.id });
      const data = result.data as any;
      setSelectedIntake(null);
      setClarificationNote('');
      setNotice({
        severity: 'success',
        text: `Owner approved. Contract ${data?.contractId || ''} is now pending owner signature and email was queued.`,
      });
    } catch (error: any) {
      console.error('Server owner approval failed:', error);
      setNotice({ severity: 'error', text: error?.message || 'Server approval failed. Check Cloud Functions logs and Admin role.' });
    } finally {
      setBusy(false);
    }
  };

  const docs = selected?.proofDocuments || {};
  const docsList = Object.entries(docs).filter(([key, value]) => value && key !== '__uploadFallback' && key !== 'note');
  const selectedProperties = selected?.properties || [];
  const plan = selected ? readPlan(selected) : null;
  const payment = selected ? readPayment(selected) : null;

  const stateColor = (intake: IntakeSubmission) => intake.status === 'CONVERTED_TO_OWNER' ? '#22c55e' : intake.adminReviewState === 'READY_FOR_ACTIVATION' ? '#f59e0b' : binThemeTokens.gold;

  return (
    <AdminPageFrame
      title="OWNER VERIFICATION INBOX"
      subtitle="Review owner onboarding, contact owners, create inspections, verify payment/documents/location, then issue contract signing email."
      loading={loading}
      isEmpty={submissions.length === 0}
      emptyMessage="No owner submissions found yet."
      breadcrumbs={[{ label: 'Owner Verification Inbox' }]}
    >
      {notice && <Alert severity={notice.severity} sx={{ mb: 2 }}>{notice.text}</Alert>}

      <Alert severity="info" sx={{ mb: 2, bgcolor: alpha('#38bdf8', 0.08), border: `1px solid ${alpha('#38bdf8', 0.25)}` }}>
        Admin workflow: contact owner → verify 15% payment → verify documents → verify property GPS → create site inspection if required → approve and email selected contract for owner signature.
      </Alert>

      <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>OWNER</TableCell>
              <TableCell>SUBMITTED</TableCell>
              <TableCell>ASSETS</TableCell>
              <TableCell>PAYMENT</TableCell>
              <TableCell>ADMIN STATE</TableCell>
              <TableCell align="right">ACTION</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {submissions.map((raw) => {
              const intake = normalizeIntake(raw);
              const rowPlan = readPlan(intake);
              const rowPayment = readPayment(intake);
              return (
                <TableRow key={intake.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 900, color: '#FFF' }}>{intake.ownerName}</Typography>
                    <Typography variant="caption" color="textSecondary">{intake.ownerEmail || intake.ownerMobile || intake.id}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Calendar size={14} color="rgba(255,255,255,0.45)" />
                      <Typography variant="caption">{safeDate(intake.createdAt || intake.updatedAt)}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFF' }}>{intake.properties?.length || 0} ASSETS</Typography>
                    <Typography variant="caption" color="textSecondary">{rowPlan.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`${rowPayment.status} ${rowPayment.amount ? money(rowPayment.amount) : ''}`.trim()}
                      variant="outlined"
                      size="small"
                      sx={{ fontSize: '0.6rem', fontWeight: 900, color: rowPayment.status === 'VERIFIED' || rowPayment.status === 'RECONCILED' ? '#10b981' : binThemeTokens.gold, borderColor: rowPayment.status === 'VERIFIED' || rowPayment.status === 'RECONCILED' ? '#10b981' : binThemeTokens.gold }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={String(intake.adminReviewState || intake.status || 'PENDING').toUpperCase()} size="small" sx={{ bgcolor: alpha(stateColor(intake), 0.15), color: stateColor(intake), fontWeight: 900, fontSize: '0.65rem' }} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => { setSelectedIntake(intake); setNotice(null); }}>
                      <Eye size={20} color={binThemeTokens.gold} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Drawer
        anchor="right"
        open={Boolean(selected)}
        onClose={() => setSelectedIntake(null)}
        PaperProps={{ sx: { width: { xs: '100%', md: 920 }, bgcolor: '#020617', borderLeft: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, p: { xs: 2, md: 4 } } }}
      >
        {selected && (
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
              <Box>
                <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold }}>OWNER VERIFICATION</Typography>
                <Typography variant="caption" color="textSecondary">{selected.id}</Typography>
              </Box>
              <IconButton onClick={() => setSelectedIntake(null)}><XCircle /></IconButton>
            </Stack>

            {notice && <Alert severity={notice.severity} sx={{ mb: 2 }}>{notice.text}</Alert>}

            <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
              {[
                ['Payment', Boolean(selected.paymentVerified || selected.paymentStatus === 'VERIFIED' || selected.paymentStatus === 'RECONCILED')],
                ['Documents', Boolean(selected.documentsVerified)],
                ['Location', Boolean(selected.locationVerified)],
              ].map(([label, done]) => (
                <Chip
                  key={String(label)}
                  icon={done ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  label={`${label}: ${done ? 'VERIFIED' : 'PENDING'}`}
                  variant="outlined"
                  sx={{ borderColor: done ? '#10b981' : binThemeTokens.gold, color: done ? '#10b981' : binThemeTokens.gold, fontWeight: 950 }}
                />
              ))}
            </Stack>

            <Stack spacing={3}>
              <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Owner / Company</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  <Typography><b>Name:</b> {selected.ownerName}</Typography>
                  <Typography><b>Email:</b> {selected.ownerEmail || 'N/A'}</Typography>
                  <Typography><b>Mobile:</b> {selected.ownerMobile || 'N/A'}</Typography>
                  <Typography><b>Registration:</b> {selected.ownerRegistrationId || selected.pendingOwnerId || 'N/A'}</Typography>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mt: 2 }}>
                  <Button startIcon={<MessageCircle />} variant="outlined" disabled={busy} onClick={() => handleContactOwner(selected)} sx={{ borderColor: '#38bdf8', color: '#38bdf8', fontWeight: 900 }}>
                    CONTACT OWNER
                  </Button>
                  <Button startIcon={<Mail />} variant="outlined" disabled={busy} onClick={() => handleContactOwner(selected)} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 900 }}>
                    EMAIL PAYMENT / DOC REQUEST
                  </Button>
                </Stack>
              </Paper>

              <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Payment Verification</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  <Typography><b>Method:</b> {payment?.method || 'N/A'}</Typography>
                  <Typography><b>15% Mobilization:</b> {money(payment?.amount)}</Typography>
                  <Typography><b>Status:</b> {payment?.status || 'PENDING'}</Typography>
                </Stack>
                <Button startIcon={<CreditCard />} onClick={() => handlePaymentVerified(selected)} disabled={busy} variant="outlined" sx={{ mt: 2, color: '#10b981', borderColor: '#10b981', fontWeight: 950 }}>
                  MARK PAYMENT VERIFIED
                </Button>
              </Paper>

              <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Documents</Typography>
                {docs.__uploadFallback && <Alert severity="warning" sx={{ mt: 1, mb: 2 }}>Documents are browser-staged metadata. Request final copies if no download URL is available.</Alert>}
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {docsList.length ? docsList.map(([key, value]: any) => {
                    const fileUrl = typeof value === 'string' ? value : (value?.downloadUrl || value?.url || value?.storageUrl || value?.publicUrl || null);
                    return (
                      <Paper key={key} sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.025), display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                        <Box>
                          <Typography variant="subtitle2" fontWeight="900">{String(key).toUpperCase()}</Typography>
                          <Typography variant="caption" color="textSecondary">{typeof value === 'object' && value?.name ? `${value.name}${value.size ? ` (${(value.size / 1024 / 1024).toFixed(2)} MB)` : ''}` : (fileUrl ? 'Document file' : 'Metadata only')}</Typography>
                        </Box>
                        {fileUrl ? (
                          <Button size="small" startIcon={<ExternalLink size={14} />} onClick={() => openExternal(fileUrl)} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>OPEN</Button>
                        ) : (
                          <Chip size="small" color="error" label="REQUEST FINAL COPIES" />
                        )}
                        <FileText size={16} color={binThemeTokens.gold} />
                      </Paper>
                    );
                  }) : <Typography variant="caption" color="textSecondary">No document metadata found.</Typography>}
                </Stack>
                <Button startIcon={<ShieldCheck />} onClick={() => handleDocumentsVerified(selected)} disabled={busy} variant="outlined" sx={{ mt: 2, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>
                  MARK DOCUMENTS VERIFIED
                </Button>
              </Paper>

              <Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 1 }} spacing={1}>
                  <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Asset Portfolio & Property Location</Typography>
                  <Button startIcon={<MapPin />} onClick={() => handleLocationVerified(selected)} disabled={busy} variant="outlined" sx={{ color: '#10b981', borderColor: '#10b981', fontWeight: 950 }}>
                    MARK LOCATION VERIFIED
                  </Button>
                </Stack>
                <Stack spacing={2} sx={{ mt: 1 }}>
                  {selectedProperties.length ? selectedProperties.map((property: any, index: number) => {
                    const gps = extractLatLng(property);
                    const gpsText = gps ? `${gps.lat}, ${gps.lng}` : 'No GPS captured';
                    return (
                      <Paper key={`${propertyAddress(property)}-${index}`} sx={{ p: 2.5, bgcolor: alpha(binThemeTokens.gold, 0.025), border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, borderRadius: 3 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                          <Box>
                            <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF' }}>{propertyAddress(property)}</Typography>
                            <Typography variant="caption" color="textSecondary">{emirateLabel(property)} | {property.units || property.numberOfUnits || 0} Units | {property.areaSqFt || property.sqft || property.sizeSqFt || 'SqFt N/A'} Sq Ft | Age {property.age || property.propertyAge || 'N/A'}</Typography>
                            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: gps ? binThemeTokens.gold : '#ef4444', mt: 1, fontWeight: 900 }}>
                              <MapPin size={14} /> {gpsText}
                            </Typography>
                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5 }}>This GPS becomes the default technician and tenant dispatch location.</Typography>
                          </Box>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <Button startIcon={<ExternalLink />} variant="outlined" onClick={() => openExternal(buildMapsSearchUrl(property))} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>OPEN MAP</Button>
                            <Button startIcon={<Navigation />} variant="outlined" onClick={() => openExternal(buildMapsDirectionsUrl(property))} sx={{ borderColor: '#3b82f6', color: '#3b82f6', fontWeight: 950 }}>DIRECTIONS</Button>
                            <Button startIcon={<Copy />} variant="outlined" onClick={() => copyText(gps ? gpsText : `${propertyAddress(property)}, ${emirateLabel(property)}`)} sx={{ fontWeight: 950 }}>COPY GPS</Button>
                          </Stack>
                        </Stack>
                      </Paper>
                    );
                  }) : <Typography variant="caption" color="textSecondary">No property records found inside this submission.</Typography>}
                </Stack>
                <Button startIcon={<Wrench />} onClick={() => handleCreateInspection(selected)} disabled={busy || selectedProperties.length === 0} variant="outlined" sx={{ mt: 2, color: '#38bdf8', borderColor: '#38bdf8', fontWeight: 950 }}>
                  CREATE SITE INSPECTION / ASSIGN DISPATCH JOB
                </Button>
              </Box>

              <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Contract Package</Typography>
                <Typography variant="body2"><b>Plan:</b> {plan?.name || 'TBD'}</Typography>
                <Typography variant="body2"><b>Plan Type:</b> {plan?.type || 'hybrid'}</Typography>
                <Typography variant="body2"><b>Add-Ons:</b> {Array.isArray(selected.selectedAddOns) && selected.selectedAddOns.length ? selected.selectedAddOns.join(', ') : 'NONE'}</Typography>
                <Typography variant="body2"><b>Annual Value:</b> {money(payment?.annualValue || selected.pricing?.annualContractValue || selected.portfolioSummary?.estimatedACV)}</Typography>
                <Alert severity="success" sx={{ mt: 2 }}>
                  Approval now calls the Cloud Function. It creates active owner/property/passport records, verified payment, tenant GPS inheritance policy, pending-signature contract, and the owner email signing request.
                </Alert>
              </Paper>

              <TextField
                label="Clarification / message note"
                value={clarificationNote}
                onChange={(event) => setClarificationNote(event.target.value)}
                multiline
                rows={3}
                InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }}
                InputProps={{ style: { color: '#FFF' } }}
                helperText="Used for Contact Owner, payment/document request, or rejection clarification."
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 2 }}>
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<CheckCircle />}
                  onClick={() => handleApprove(selected)}
                  disabled={busy || selected.status === 'CONVERTED_TO_OWNER'}
                  sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2 }}
                >
                  {selected.status === 'CONVERTED_TO_OWNER' ? 'ACTIVE' : 'APPROVE + EMAIL CONTRACT FOR SIGNATURE'}
                </Button>
                <Button fullWidth variant="outlined" color="error" startIcon={<XCircle />} disabled={busy} onClick={() => handleReject(selected)} sx={{ fontWeight: 900, py: 2 }}>
                  REJECT / REQUEST CLARIFICATION
                </Button>
                <Button fullWidth variant="outlined" startIcon={<UserPlus />} disabled sx={{ fontWeight: 900, py: 2 }}>
                  OWNER ADDS TENANTS AFTER SIGNATURE
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}
      </Drawer>
    </AdminPageFrame>
  );
};

export default IntakeVaultPage;
