import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Chip, IconButton, Button, Drawer, Stack,
    Alert, alpha, Grid, TextField
} from '@mui/material';
import {
    Eye, CheckCircle, XCircle, BrainCircuit,
    Calendar, ShieldCheck, FileText, CreditCard, MapPin,
    Navigation, ExternalLink, Copy, CheckCircle2
} from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

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

const money = (value: any) => `AED ${Number(value || 0).toLocaleString()}`;

const asFiniteNumber = (value: any): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const safeDocId = (value: any, fallback: string) => {
    const raw = String(value || '').trim();
    const safe = raw.replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 180);
    return safe || fallback;
};

const stableOwnerId = (intake: any) =>
    safeDocId(
        intake.userId ||
        intake.ownerUid ||
        intake.pendingPaymentSubmission?.ownerAccount?.uid ||
        intake.ownerAccount?.uid ||
        intake.pendingOwnerId ||
        intake.ownerRegistrationId ||
        intake.ownerEmail ||
        intake.id,
        `owner_${intake.id}`
    );

const extractLatLng = (property: any) => {
    const lat = asFiniteNumber(
        property?.geo?.lat ??
        property?.geo?.latitude ??
        property?.location?.lat ??
        property?.location?.latitude ??
        property?.coordinates?.lat ??
        property?.coordinates?.latitude ??
        property?.lat ??
        property?.latitude
    );
    const lng = asFiniteNumber(
        property?.geo?.lng ??
        property?.geo?.longitude ??
        property?.location?.lng ??
        property?.location?.longitude ??
        property?.coordinates?.lng ??
        property?.coordinates?.longitude ??
        property?.lng ??
        property?.longitude
    );
    return lat !== null && lng !== null ? { lat, lng } : null;
};

const propertyAddress = (property: any) =>
    property?.propertyName ||
    property?.addressLine ||
    property?.address ||
    property?.locationAddress ||
    property?.name ||
    'Property Node';

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

const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
};

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

interface IntakeSubmission {
    id: string;
    userId?: string;
    ownerUid?: string;
    ownerName?: string;
    ownerEmail?: string;
    ownerMobile?: string;
    ownerRegistrationId?: string;
    pendingOwnerId?: string;
    status: string;
    source: string;
    createdAt: any;
    updatedAt?: any;
    contactInfo?: {
        name: string;
        email: string;
        licenseNumber: string;
        phone?: string;
        contactPerson?: string;
    };
    properties?: any[];
    portfolioSummary?: {
        totalUnits: number;
        recommendedTier: string;
        estimatedACV?: number;
    };
    aiAssessment?: {
        score: number;
        aiModel: string;
        riskLevel: string;
        valuationRange: {
            min: number;
            max: number;
            currency: string;
        };
        maintenanceForecast: Array<{
            item: string;
            value: number;
            period: string;
        }>;
        efficiencyRecommendations: string[];
    };
    payment?: any;
    pricing?: any;
    selectedPlan?: any;
    contractType?: string;
    selectedAddOns?: string[];
    proofDocuments?: any;
    proofDocumentMetadata?: any;
    kycUrls?: any;
    pendingPaymentSubmission?: any;
    paymentStatus?: string;
    paymentVerified?: boolean;
    documentsVerified?: boolean;
    locationVerified?: boolean;
    adminReviewState?: string;
    activationState?: string;
}

const normalizeIntake = (raw: IntakeSubmission) => {
    const pending = raw.pendingPaymentSubmission || {};
    const pendingPayment = pending.payment || {};
    const pendingPricing = pending.pricing || {};
    const pendingProofs = pending.proofDocuments || pending.proofDocumentMetadata || {};
    const properties = raw.properties?.length ? raw.properties : (pending.properties || []);
    const ownerName = raw.ownerName || raw.contactInfo?.name || pending.ownerAccount?.fullName || pending.companyProfile?.name || 'Pending Owner';
    const ownerEmail = raw.ownerEmail || raw.contactInfo?.email || pending.ownerAccount?.email || pending.companyProfile?.email || '';
    const ownerMobile = raw.ownerMobile || raw.contactInfo?.phone || pending.ownerAccount?.mobile || pending.companyProfile?.phone || '';
    const payment = raw.payment || pendingPayment || {};
    const pricing = raw.pricing || pendingPricing || {};
    const proofDocuments = raw.proofDocuments || raw.proofDocumentMetadata || pendingProofs || {};
    return {
        ...raw,
        ownerName,
        ownerEmail,
        ownerMobile,
        properties,
        payment,
        pricing,
        proofDocuments,
        selectedPlan: raw.selectedPlan || pending.selectedPlan || null,
        selectedAddOns: raw.selectedAddOns || pending.selectedAddOns || [],
        portfolioSummary: raw.portfolioSummary || pending.portfolioSummary || {},
        createdAt: raw.createdAt || raw.updatedAt || pending.submittedAt,
        status: raw.status || 'AWAITING_VERIFICATION',
        paymentStatus: raw.paymentStatus || pending.paymentStatus || payment.status || 'PENDING',
        paymentVerified: raw.paymentVerified || raw.paymentStatus === 'VERIFIED' || raw.paymentStatus === 'RECONCILED',
        documentsVerified: Boolean(raw.documentsVerified),
        locationVerified: Boolean(raw.locationVerified),
        adminReviewState: raw.adminReviewState || pending.adminReviewState || 'AWAITING_VERIFICATION'
    } as IntakeSubmission;
};

const normalizePropertyForActivation = (property: any, intake: IntakeSubmission, ownerId: string, index: number, contractId: string) => {
    const gps = extractLatLng(property);
    const propertyId = safeDocId(property?.propertyId || property?.id || `${intake.id}_property_${index + 1}`, `${intake.id}_property_${index + 1}`);
    const address = propertyAddress(property);
    const emirate = emirateLabel(property);
    return {
        ...property,
        id: propertyId,
        propertyId,
        ownerId,
        ownerEmail: intake.ownerEmail || '',
        ownerName: intake.ownerName || 'Owner',
        contractId,
        propertyName: address,
        name: address,
        addressLine: property?.addressLine || property?.address || address,
        address: property?.address || property?.addressLine || address,
        emirate,
        city: property?.city || property?.area || emirate,
        area: property?.area || property?.city || emirate,
        geo: gps ? {
            ...(property?.geo || {}),
            lat: gps.lat,
            lng: gps.lng,
            verified: true,
            dispatchReady: true,
            verifiedAt: serverTimestamp(),
            verifiedBy: auth.currentUser?.uid || 'ADMIN_HUB_V7'
        } : property?.geo || null,
        location: gps ? { lat: gps.lat, lng: gps.lng } : property?.location || null,
        coordinates: gps ? { lat: gps.lat, lng: gps.lng } : property?.coordinates || null,
        status: 'ACTIVE',
        activationState: 'ACTIVE',
        dispatchReady: Boolean(gps),
        verified: true,
        approved: true,
        source: 'ADMIN_APPROVED_OWNER_ONBOARDING',
        updatedAt: serverTimestamp()
    };
};

export const IntakeVaultPage: React.FC = () => {
    const [submissions, setSubmissions] = useState<IntakeSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIntake, setSelectedIntake] = useState<IntakeSubmission | null>(null);
    const [clarificationNote, setClarificationNote] = useState('');

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'intake_submissions'), (snapshot) => {
            const docs = snapshot.docs
                .map(d => normalizeIntake({ id: d.id, ...d.data() } as IntakeSubmission))
                .sort((a, b) => getMillis(b.createdAt || b.updatedAt) - getMillis(a.createdAt || a.updatedAt));
            setSubmissions(docs);
            setLoading(false);
        }, (error) => {
            console.error('Failed to load intake submissions:', error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const refreshSelectedLocal = (patch: Partial<IntakeSubmission>) => {
        setSelectedIntake(prev => prev ? normalizeIntake({ ...prev, ...patch } as IntakeSubmission) : prev);
    };

    const handlePaymentVerified = async (intake: IntakeSubmission) => {
        await updateDoc(doc(db, 'intake_submissions', intake.id), {
            paymentStatus: 'VERIFIED',
            paymentVerified: true,
            paymentState: 'PAYMENT_VERIFIED',
            adminReviewState: intake.documentsVerified && intake.locationVerified ? 'READY_FOR_ACTIVATION' : 'PAYMENT_VERIFIED_PENDING_DOCUMENTS_LOCATION',
            paymentVerifiedAt: serverTimestamp(),
            paymentVerifiedBy: auth.currentUser?.uid || 'ADMIN_HUB_V7',
            updatedAt: serverTimestamp()
        });
        refreshSelectedLocal({ paymentStatus: 'VERIFIED', paymentVerified: true, adminReviewState: 'PAYMENT_VERIFIED_PENDING_DOCUMENTS_LOCATION' });
    };

    const handleDocumentsVerified = async (intake: IntakeSubmission) => {
        await updateDoc(doc(db, 'intake_submissions', intake.id), {
            documentsVerified: true,
            documentsVerifiedAt: serverTimestamp(),
            documentsVerifiedBy: auth.currentUser?.uid || 'ADMIN_HUB_V7',
            adminReviewState: intake.paymentVerified && intake.locationVerified ? 'READY_FOR_ACTIVATION' : 'DOCUMENTS_VERIFIED_PENDING_PAYMENT_LOCATION',
            updatedAt: serverTimestamp()
        });
        refreshSelectedLocal({ documentsVerified: true, adminReviewState: 'DOCUMENTS_VERIFIED_PENDING_PAYMENT_LOCATION' });
    };

    const handleLocationVerified = async (intake: IntakeSubmission) => {
        await updateDoc(doc(db, 'intake_submissions', intake.id), {
            locationVerified: true,
            locationVerifiedAt: serverTimestamp(),
            locationVerifiedBy: auth.currentUser?.uid || 'ADMIN_HUB_V7',
            adminReviewState: intake.paymentVerified && intake.documentsVerified ? 'READY_FOR_ACTIVATION' : 'LOCATION_VERIFIED_PENDING_PAYMENT_DOCUMENTS',
            updatedAt: serverTimestamp()
        });
        refreshSelectedLocal({ locationVerified: true, adminReviewState: 'LOCATION_VERIFIED_PENDING_PAYMENT_DOCUMENTS' });
    };

    const handleReject = async (intake: IntakeSubmission) => {
        const note = clarificationNote.trim();
        if (!note) {
            alert('Add a clarification / rejection note before rejecting this owner submission.');
            return;
        }
        if (!window.confirm('Reject this owner submission and keep the reason on the audit record?')) return;

        await updateDoc(doc(db, 'intake_submissions', intake.id), {
            status: 'REJECTED',
            adminReviewState: 'REJECTED_NEEDS_CLARIFICATION',
            rejectionNote: note,
            rejectedAt: serverTimestamp(),
            rejectedBy: auth.currentUser?.uid || 'ADMIN_HUB_V7',
            updatedAt: serverTimestamp()
        });
        setSelectedIntake(null);
        setClarificationNote('');
    };

    const handleApprove = async (intake: IntakeSubmission) => {
        const missing: string[] = [];
        if (!intake.paymentVerified && intake.paymentStatus !== 'VERIFIED' && intake.paymentStatus !== 'RECONCILED') missing.push('payment');
        if (!intake.documentsVerified) missing.push('documents');
        if (!intake.locationVerified) missing.push('property location');

        if (missing.length && !window.confirm(`The following checks are not marked verified: ${missing.join(', ')}. Continue only if the CEO/Admin has manually verified them offline.`)) {
            return;
        }

        try {
            const batch = writeBatch(db);
            const intakeRef = doc(db, 'intake_submissions', intake.id);
            const adminId = auth.currentUser?.uid || 'ADMIN_HUB_V7';
            const ownerId = stableOwnerId(intake);
            const ownerEmail = String(intake.ownerEmail || '').toLowerCase();
            const ownerName = intake.ownerName || 'Owner';
            const annualValue = Number(intake.pricing?.annualContractValue || intake.portfolioSummary?.estimatedACV || intake.payment?.annualValue || 0);
            const mobilizationAmount = Number(intake.payment?.amount || intake.pricing?.mobilizationAmount || Math.round(annualValue * 0.15));
            const contractId = safeDocId(intake.pendingPaymentSubmission?.contractId || intake.payment?.contractId || `${intake.id}_contract`, `${intake.id}_contract`);
            const paymentId = safeDocId(intake.payment?.paymentId || `${intake.id}_mobilization`, `${intake.id}_mobilization`);
            const properties = (intake.properties || []).map((property, index) => normalizePropertyForActivation(property, intake, ownerId, index, contractId));
            const propertyIds = properties.map((property) => property.propertyId);
            const primaryProperty = properties[0] || null;
            const signUrl = `${window.location.origin}/owner/contracts`;

            batch.update(intakeRef, {
                status: 'CONVERTED_TO_OWNER',
                adminReviewState: 'APPROVED_PENDING_OWNER_SIGNATURE',
                activationState: 'PENDING_OWNER_SIGNATURE',
                paymentStatus: 'RECONCILED',
                paymentState: 'PAYMENT_VERIFIED',
                paymentVerified: true,
                documentsVerified: true,
                locationVerified: true,
                ownerUid: ownerId,
                activeOwnerId: ownerId,
                activeContractId: contractId,
                activePropertyIds: propertyIds,
                contractDeliveryState: 'SIGNATURE_REQUEST_EMAIL_QUEUED',
                approvedAt: serverTimestamp(),
                approvedBy: adminId,
                updatedAt: serverTimestamp()
            });

            batch.set(doc(db, 'users', ownerId), {
                uid: ownerId,
                role: 'owner',
                status: 'PENDING_OWNER_SIGNATURE',
                dashboardUnlocked: true,
                activeContractId: contractId,
                activePropertyIds: propertyIds,
                latestIntakeId: intake.id,
                email: ownerEmail,
                displayName: ownerName,
                updatedAt: serverTimestamp()
            }, { merge: true });

            batch.set(doc(db, 'owners', ownerId), {
                uid: ownerId,
                ownerId,
                name: ownerName,
                displayName: ownerName,
                email: ownerEmail,
                phone: intake.ownerMobile || '',
                status: 'PENDING_OWNER_SIGNATURE',
                dashboardUnlocked: true,
                activeContractId: contractId,
                activePropertyIds: propertyIds,
                latestIntakeId: intake.id,
                paymentVerified: true,
                documentsVerified: true,
                locationVerified: true,
                updatedAt: serverTimestamp()
            }, { merge: true });

            properties.forEach((property) => {
                batch.set(doc(db, 'properties', property.propertyId), property, { merge: true });
                batch.set(doc(db, 'propertyPassports', property.propertyId), {
                    passportId: property.propertyId,
                    propertyId: property.propertyId,
                    ownerId,
                    ownerName,
                    ownerEmail,
                    contractId,
                    intakeId: intake.id,
                    address: property.addressLine,
                    emirate: property.emirate,
                    city: property.city,
                    area: property.area,
                    gps: property.geo ? { lat: property.geo.lat, lng: property.geo.lng } : null,
                    dispatchReady: property.dispatchReady,
                    status: 'ACTIVE',
                    paymentVerified: true,
                    documentsVerified: true,
                    locationVerified: true,
                    annualContractValue: annualValue,
                    mobilizationAmount,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            });

            batch.set(doc(db, 'contracts', contractId), {
                contractId,
                id: contractId,
                intakeId: intake.id,
                ownerId,
                ownerEmail,
                ownerName,
                propertyId: primaryProperty?.propertyId || '',
                propertyIds,
                propertyName: primaryProperty?.propertyName || primaryProperty?.addressLine || 'Portfolio',
                properties,
                status: 'PENDING_OWNER_SIGNATURE',
                contractStatus: 'awaiting_owner_signature',
                activationStatus: 'PENDING_OWNER_SIGNATURE',
                paymentVerified: true,
                paymentStatus: 'RECONCILED',
                documentsVerified: true,
                locationVerified: true,
                approved: true,
                approvedAt: serverTimestamp(),
                approvedBy: adminId,
                packageName: intake.selectedPlan?.name || intake.selectedPlan?.packageName || intake.portfolioSummary?.recommendedTier || 'Institutional Package',
                planType: intake.selectedPlan?.id || intake.contractType || 'hybrid',
                selectedPlan: intake.selectedPlan || null,
                selectedAddOns: intake.selectedAddOns || [],
                annualValue,
                annualContractValue: annualValue,
                depositAmount: mobilizationAmount,
                paymentSchedule: {
                    mobilizationPercent: 15,
                    mobilizationAmount,
                    remainingBalance: Math.max(annualValue - mobilizationAmount, 0),
                    currency: 'AED'
                },
                signatureState: {
                    ownerSigned: false,
                    binGroupsApproved: true,
                    binGroupsApprovedAt: new Date().toISOString(),
                    pdfGenerated: false,
                    emailed: true,
                    signUrl
                },
                emailDelivery: {
                    signRequestQueued: true,
                    signRequestQueuedAt: new Date().toISOString(),
                    recipient: ownerEmail
                },
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            }, { merge: true });

            batch.set(doc(db, 'payment_transactions', paymentId), {
                paymentId,
                intakeId: intake.id,
                ownerId,
                ownerEmail,
                contractId,
                propertyId: primaryProperty?.propertyId || '',
                amount: mobilizationAmount,
                currency: 'AED',
                method: intake.payment?.method || 'MANUAL',
                status: 'VERIFIED',
                verificationState: 'ADMIN_VERIFIED',
                verified: true,
                verifiedAt: serverTimestamp(),
                verifiedBy: adminId,
                unlocksDashboard: true,
                updatedAt: serverTimestamp()
            }, { merge: true });

            batch.set(doc(db, 'owner_dashboard_unlocks', ownerId), {
                ownerId,
                intakeId: intake.id,
                contractId,
                propertyIds,
                unlocked: true,
                unlockState: 'PENDING_OWNER_SIGNATURE',
                unlockedAt: serverTimestamp(),
                unlockedBy: adminId,
                updatedAt: serverTimestamp()
            }, { merge: true });

            batch.set(doc(collection(db, 'notifications')), {
                userId: ownerId,
                toRole: 'owner',
                type: 'CONTRACT_SIGNATURE_REQUIRED',
                title: 'Contract ready for signature',
                body: 'BIN GROUP verified your onboarding. Open Contracts to sign and receive your final PDF.',
                url: '/owner/contracts',
                read: false,
                createdAt: serverTimestamp()
            });

            if (ownerEmail) {
                batch.set(doc(collection(db, 'mail')), {
                    to: ownerEmail,
                    message: {
                        subject: 'BIN GROUP Contract Ready for Signature',
                        html: `<p>Dear ${ownerName},</p><p>Your BIN GROUP onboarding has been approved. Please sign your contract inside the Owner Portal.</p><p><a href="${signUrl}">Open contract for signature</a></p><p>After signature, the final contract PDF will be generated and emailed to you.</p>`
                    },
                    createdAt: serverTimestamp()
                });
            }

            batch.set(doc(collection(db, 'audit_logs')), {
                actorId: adminId,
                actorRole: 'admin',
                action: 'APPROVE_OWNER_SUBMISSION_AND_ISSUE_SIGNATURE_REQUEST',
                targetType: 'intake_submissions',
                targetId: intake.id,
                metadata: { ownerId, ownerEmail, contractId, propertyIds, paymentId },
                createdAt: serverTimestamp()
            });

            await batch.commit();
            setSelectedIntake(null);
            setClarificationNote('');
            alert('Owner approved. Contract signature email queued, dashboard unlocked, and active owner/property/payment records created.');
        } catch (err) {
            console.error('Conversion Protocol Fault:', err);
            alert('Relational Provisioning Failure. Check console and Firestore rules.');
        }
    };

    const selected = selectedIntake ? normalizeIntake(selectedIntake) : null;
    const docs = selected?.proofDocuments || {};
    const docsList = Object.entries(docs).filter(([key, value]) => value && key !== '__uploadFallback' && key !== 'note');
    const selectedProperties = selected?.properties || [];

    const verificationChips = selected ? [
        { label: 'Payment', done: selected.paymentVerified || selected.paymentStatus === 'VERIFIED' || selected.paymentStatus === 'RECONCILED' },
        { label: 'Documents', done: selected.documentsVerified },
        { label: 'Location', done: selected.locationVerified }
    ] : [];

    return (
        <AdminPageFrame
            title="OWNER VERIFICATION INBOX"
            subtitle="Review pending owner onboarding, documents, payment, contract package and property GPS before activation"
            loading={loading}
            isEmpty={submissions.length === 0}
            emptyMessage="No pending owner submissions found yet."
            breadcrumbs={[{ label: 'Owner Verification Inbox' }]}
        >
            <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)' }}>
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
                            const amount = intake.payment?.amount || intake.pricing?.mobilizationAmount;
                            return (
                                <TableRow key={intake.id} hover>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 900, color: '#FFF' }}>{intake.ownerName}</Typography>
                                        <Typography variant="caption" color="textSecondary">{intake.ownerEmail || intake.ownerMobile || intake.id}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Calendar size={14} color="rgba(255,255,255,0.4)" />
                                            <Typography variant="caption">{safeDate(intake.createdAt || intake.updatedAt)}</Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFF' }}>
                                            {intake.properties?.length || 0} ASSETS
                                        </Typography>
                                        <Typography variant="caption" color="textSecondary">
                                            {intake.selectedPlan?.name || intake.portfolioSummary?.recommendedTier || 'PENDING PACKAGE'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={`${String(intake.paymentStatus || 'PENDING').toUpperCase()} ${amount ? money(amount) : ''}`.trim()}
                                            variant="outlined"
                                            size="small"
                                            sx={{ fontSize: '0.6rem', fontWeight: 900, color: intake.paymentStatus === 'VERIFIED' ? '#10b981' : binThemeTokens.gold, borderColor: intake.paymentStatus === 'VERIFIED' ? '#10b981' : binThemeTokens.gold }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={String(intake.adminReviewState || intake.status || 'PENDING').toUpperCase()}
                                            size="small"
                                            color={intake.status === 'CONVERTED_TO_OWNER' ? 'success' : 'warning'}
                                            sx={{ fontWeight: 900, fontSize: '0.65rem' }}
                                        />
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton onClick={() => setSelectedIntake(intake)}>
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
                open={!!selected}
                onClose={() => setSelectedIntake(null)}
                PaperProps={{ sx: { width: { xs: '100%', md: 820 }, bgcolor: '#020617', borderLeft: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, p: 4 } }}
            >
                {selected && (
                    <Box>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
                            <Box>
                                <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold }}>OWNER VERIFICATION</Typography>
                                <Typography variant="caption" color="textSecondary">{selected.id}</Typography>
                            </Box>
                            <IconButton onClick={() => setSelectedIntake(null)}><XCircle /></IconButton>
                        </Stack>

                        <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
                            {verificationChips.map((chip) => (
                                <Chip
                                    key={chip.label}
                                    icon={chip.done ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                                    label={`${chip.label}: ${chip.done ? 'VERIFIED' : 'PENDING'}`}
                                    variant="outlined"
                                    sx={{
                                        borderColor: chip.done ? '#10b981' : binThemeTokens.gold,
                                        color: chip.done ? '#10b981' : binThemeTokens.gold,
                                        fontWeight: 950
                                    }}
                                />
                            ))}
                        </Stack>

                        <Stack spacing={3}>
                            <Alert severity="info" icon={<BrainCircuit />} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, color: '#FFF' }}>
                                <Typography variant="subtitle2" fontWeight="900">Pending owner submission captured successfully</Typography>
                                <Typography variant="caption">Verify payment, documents and property location before activating the owner dashboard.</Typography>
                            </Alert>

                            <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Owner / Company</Typography>
                                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                    <Grid item xs={12} sm={6}><Typography variant="caption" color="textSecondary">NAME</Typography><Typography fontWeight="900">{selected.ownerName}</Typography></Grid>
                                    <Grid item xs={12} sm={6}><Typography variant="caption" color="textSecondary">EMAIL</Typography><Typography fontWeight="700">{selected.ownerEmail || 'N/A'}</Typography></Grid>
                                    <Grid item xs={12} sm={6}><Typography variant="caption" color="textSecondary">MOBILE</Typography><Typography fontWeight="700">{selected.ownerMobile || 'N/A'}</Typography></Grid>
                                    <Grid item xs={12} sm={6}><Typography variant="caption" color="textSecondary">REGISTRATION</Typography><Typography fontWeight="700">{selected.ownerRegistrationId || selected.pendingOwnerId || 'N/A'}</Typography></Grid>
                                </Grid>
                            </Paper>

                            <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Payment Verification</Typography>
                                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                    <Grid item xs={12} sm={4}><Typography variant="caption" color="textSecondary">METHOD</Typography><Typography fontWeight="900">{selected.payment?.method || 'N/A'}</Typography></Grid>
                                    <Grid item xs={12} sm={4}><Typography variant="caption" color="textSecondary">MOBILIZATION</Typography><Typography fontWeight="900">{money(selected.payment?.amount || selected.pricing?.mobilizationAmount)}</Typography></Grid>
                                    <Grid item xs={12} sm={4}><Typography variant="caption" color="textSecondary">STATUS</Typography><Typography fontWeight="900">{selected.paymentStatus || 'PENDING'}</Typography></Grid>
                                </Grid>
                                <Button startIcon={<CreditCard />} onClick={() => handlePaymentVerified(selected)} variant="outlined" sx={{ mt: 2, color: '#10b981', borderColor: '#10b981', fontWeight: 950 }}>
                                    MARK PAYMENT VERIFIED
                                </Button>
                            </Paper>

                            <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Documents</Typography>
                                {docs.__uploadFallback && (
                                    <Alert severity="warning" sx={{ mt: 1, mb: 2 }}>Documents are browser-staged metadata. Admin must request/verify final document copies before activation.</Alert>
                                )}
                                <Stack spacing={1} sx={{ mt: 1 }}>
                                    {docsList.length ? docsList.map(([key, value]: any) => {
                                        const fileUrl = value?.downloadUrl || value?.url || value?.storageUrl || value?.publicUrl;
                                        return (
                                            <Paper key={key} sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.02), display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
                                                <Box>
                                                    <Typography variant="subtitle2" fontWeight="900">{String(key).toUpperCase()}</Typography>
                                                    <Typography variant="caption" color="textSecondary">{value?.name || fileUrl || 'Submitted metadata'}</Typography>
                                                </Box>
                                                <Stack direction="row" spacing={1}>
                                                    {fileUrl && (
                                                        <IconButton size="small" onClick={() => openExternal(fileUrl)}><ExternalLink size={16} color={binThemeTokens.gold} /></IconButton>
                                                    )}
                                                    <FileText size={16} color={binThemeTokens.gold} />
                                                </Stack>
                                            </Paper>
                                        );
                                    }) : <Typography variant="caption" color="textSecondary">No document metadata found.</Typography>}
                                </Stack>
                                <Button startIcon={<ShieldCheck />} onClick={() => handleDocumentsVerified(selected)} variant="outlined" sx={{ mt: 2, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>
                                    MARK DOCUMENTS VERIFIED
                                </Button>
                            </Paper>

                            <Box>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                    <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Asset Portfolio & Property Location</Typography>
                                    <Button startIcon={<MapPin />} onClick={() => handleLocationVerified(selected)} variant="outlined" sx={{ color: '#10b981', borderColor: '#10b981', fontWeight: 950 }}>
                                        MARK LOCATION VERIFIED
                                    </Button>
                                </Stack>
                                <Stack spacing={2} sx={{ mt: 1 }}>
                                    {selectedProperties.length ? selectedProperties.map((p: any, i: number) => {
                                        const gps = extractLatLng(p);
                                        const gpsText = gps ? `${gps.lat}, ${gps.lng}` : 'No GPS captured';
                                        const mapsUrl = buildMapsSearchUrl(p);
                                        const directionsUrl = buildMapsDirectionsUrl(p);
                                        return (
                                            <Paper key={i} sx={{ p: 2.5, bgcolor: alpha(binThemeTokens.gold, 0.025), border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, borderRadius: 3 }}>
                                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                                                    <Box>
                                                        <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF' }}>{propertyAddress(p)}</Typography>
                                                        <Typography variant="caption" color="textSecondary">{emirateLabel(p)} | {p.units || p.numberOfUnits || 0} Units | {p.areaSqFt || p.sqft || p.sizeSqFt || 'SqFt N/A'} Sq Ft | Age {p.age || p.propertyAge || 'N/A'}</Typography>
                                                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: gps ? binThemeTokens.gold : '#ef4444', mt: 1, fontWeight: 900 }}>
                                                            <MapPin size={14} /> {gpsText}
                                                        </Typography>
                                                        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5 }}>This is the exact technician dispatch point. Admin can open map, directions, or copy GPS for WhatsApp/work order.</Typography>
                                                    </Box>
                                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                                        <Button startIcon={<ExternalLink />} variant="outlined" onClick={() => openExternal(mapsUrl)} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
                                                            OPEN MAP
                                                        </Button>
                                                        <Button startIcon={<Navigation />} variant="outlined" onClick={() => openExternal(directionsUrl)} sx={{ borderColor: '#3b82f6', color: '#3b82f6', fontWeight: 950 }}>
                                                            DIRECTIONS
                                                        </Button>
                                                        <Button startIcon={<Copy />} variant="outlined" onClick={() => copyText(gps ? gpsText : `${propertyAddress(p)}, ${emirateLabel(p)}`)} sx={{ fontWeight: 950 }}>
                                                            COPY GPS
                                                        </Button>
                                                    </Stack>
                                                </Stack>
                                            </Paper>
                                        );
                                    }) : <Typography variant="caption" color="textSecondary">No property records found inside this submission.</Typography>}
                                </Stack>
                            </Box>

                            <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>Contract Package</Typography>
                                <Typography variant="body2"><b>Plan:</b> {selected.selectedPlan?.name || selected.portfolioSummary?.recommendedTier || 'TBD'}</Typography>
                                <Typography variant="body2"><b>Add-Ons:</b> {Array.isArray(selected.selectedAddOns) && selected.selectedAddOns.length ? selected.selectedAddOns.join(', ') : 'NONE'}</Typography>
                                <Typography variant="body2"><b>Annual Value:</b> {money(selected.pricing?.annualContractValue || selected.portfolioSummary?.estimatedACV)}</Typography>
                                <Alert severity="success" sx={{ mt: 2 }}>
                                    Approval now provisions active owner records, active properties, property passports, a pending-signature contract, verified payment transaction and an owner email signing request.
                                </Alert>
                            </Paper>

                            <TextField
                                label="Clarification / rejection note"
                                value={clarificationNote}
                                onChange={(e) => setClarificationNote(e.target.value)}
                                multiline
                                rows={3}
                                InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }}
                                InputProps={{ style: { color: '#FFF' } }}
                            />

                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 2 }}>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    startIcon={<CheckCircle />}
                                    onClick={() => handleApprove(selected)}
                                    disabled={selected.status === 'CONVERTED_TO_OWNER'}
                                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2 }}
                                >
                                    {selected.status === 'CONVERTED_TO_OWNER' ? 'ACTIVE' : 'APPROVE + EMAIL CONTRACT FOR SIGNATURE'}
                                </Button>
                                <Button fullWidth variant="outlined" color="error" startIcon={<XCircle />} onClick={() => handleReject(selected)} sx={{ fontWeight: 900, py: 2 }}>
                                    REJECT / REQUEST CLARIFICATION
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
