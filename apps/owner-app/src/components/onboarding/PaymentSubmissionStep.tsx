import React, { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    Divider,
    Grid,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { ArrowLeft, CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    auth,
    functions,
    getDownloadURL,
    httpsCallable,
    ref,
    storage,
    uploadBytes
} from '../../lib/firebase';
import { useOnboardingStore } from '../../store/onboardingStore';
import { formatAED } from '../../utils/formatters';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildPersistableGeoAnchor } from '../../utils/geoAnchor';

const documentLabels: Record<string, string> = {
    propertyProof: 'Proof of property / ownership / title deed / lease authority proof',
    emiratesId: 'Emirates ID',
    passport: 'Passport',
    tradeLicense: 'Trade license',
    tenancySupport: 'Tenancy supporting file'
};

const COMPANY_ID = 'BIN_GROUP';
const PROJECT_ID = 'bin-group-57c60';

const getPlanCoverage = (selectedPlan: any) => ({
    included: selectedPlan?.features || [],
    excluded: selectedPlan?.exclusions || [],
    pricingBasis: selectedPlan?.id || selectedPlan?.name || 'hybrid',
    slaLevel: selectedPlan?.id === 'hybrid' ? 'Priority' : 'Standard'
});

const normalizePropertyForSubmission = (property: any, ownerId: string) => {
    const geoSource = property.geo || property.location || property.coordinates;
    const geo = buildPersistableGeoAnchor({
        lat: geoSource?.lat ?? geoSource?.latitude,
        lng: geoSource?.lng ?? geoSource?.longitude,
        address: property.addressLine || property.address || property.geo?.address,
        emirate: property.emirate || property.geo?.emirate,
        city: property.city || property.geo?.city || property.area,
        area: property.area || property.geo?.area,
        placeId: property.googlePlaceId || property.geo?.placeId,
        source: property.geo?.source || 'google_maps',
        verified: property.geo?.verified ?? true,
        requiresGeoReview: property.geo?.requiresGeoReview,
        dispatchReady: property.geo?.dispatchReady
    });

    return {
        ...property,
        companyId: COMPANY_ID,
        ownerId,
        propertyId: property.id,
        propertyName: property.propertyName || property.name || property.address || `${property.propertyType || 'Property'} ${property.id}`,
        addressLine: property.addressLine || property.address || geo.address,
        googlePlaceId: property.googlePlaceId || geo.placeId,
        city: property.city || geo.city,
        area: property.area || geo.area,
        emirate: property.emirate || geo.emirate,
        geo,
        location: { lat: geo.lat, lng: geo.lng },
        coordinates: { lat: geo.lat, lng: geo.lng },
        dispatchReady: geo.dispatchReady,
        geoAnchorStatus: geo.dispatchReady ? 'owner_confirmed' : 'admin_review_required'
    };
};

const PaymentSubmissionStep: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const navigate = useNavigate();
    const {
        properties,
        selectedPlan,
        selectedAddOns,
        portfolioSummary,
        companyProfile,
        ownerAccount,
        onboardingSessionId,
        proofDocuments,
        paymentMethod,
        setPaymentMethod,
        setIntakeId,
        reset
    } = useOnboardingStore();

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submissionResult, setSubmissionResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const estimatedAnnualValue = portfolioSummary?.estimatedACV || (portfolioSummary?.totalUnits || 1) * 2500;
    const mobilizationAmount = Math.round(estimatedAnnualValue * 0.15);
    const requiredProofKeys: Array<keyof typeof proofDocuments> = ['propertyProof', 'emiratesId', 'passport'];

    const uploadProofDocuments = async (intakeId: string, ownerUid: string) => {
        if (!ownerUid) return {};

        const cleanFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const entries = await Promise.all(
            Object.entries(proofDocuments)
                .filter(([key, file]) => key !== 'labels' && file instanceof File)
                .map(async ([key, file]) => {
                    const proofFile = file as File;
                    const contentType = proofFile.type || 'application/octet-stream';
                    const storagePath = `onboarding-proof/${ownerUid}/${intakeId}/${key}-${cleanFileName(proofFile.name)}`;
                    const storageRef = ref(storage, storagePath);
                    const baseManifest = {
                        label: documentLabels[key] || key,
                        fileName: proofFile.name,
                        contentType,
                        size: proofFile.size,
                        storagePath
                    };

                    console.info('OWNER_ONBOARDING_PROOF_UPLOAD_DEBUG', {
                        authUid: auth.currentUser?.uid || null,
                        ownerUid,
                        key,
                        storagePath,
                        contentType,
                        size: proofFile.size
                    });

                    try {
                        await uploadBytes(storageRef, proofFile, { contentType });
                        const url = await getDownloadURL(storageRef);
                        return [
                            key,
                            {
                                ...baseManifest,
                                url,
                                uploadStatus: 'uploaded'
                            }
                        ];
                    } catch (uploadError: any) {
                        console.error('OWNER_ONBOARDING_PROOF_UPLOAD_FAILED', {
                            authUid: auth.currentUser?.uid || null,
                            ownerUid,
                            key,
                            storagePath,
                            code: uploadError?.code || uploadError?.name || 'unknown',
                            message: uploadError?.message || 'Unknown proof upload error',
                            serverResponse: uploadError?.serverResponse || null
                        });

                        return [
                            key,
                            {
                                ...baseManifest,
                                uploadStatus: 'upload_failed',
                                uploadError: {
                                    code: uploadError?.code || uploadError?.name || 'unknown',
                                    message: uploadError?.message || 'Proof upload failed.'
                                }
                            }
                        ];
                    }
                })
        );

        return Object.fromEntries(entries);
    };

    const handleSubmit = async () => {
        if (!ownerAccount?.uid) {
            setError('Account creation is required before payment submission.');
            return;
        }

        const missingProofs = requiredProofKeys.filter((key) => !(proofDocuments[key] instanceof File));
        if (missingProofs.length) {
            setError(`Missing required proof document: ${missingProofs.map((key) => documentLabels[key]).join(', ')}.`);
            return;
        }

        if (!paymentMethod) {
            setError('Select a payment method before submitting onboarding.');
            return;
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
            setError('Your session expired. Please sign in again.');
            return;
        }

        const signedInOwnerAccount = {
            ...ownerAccount,
            uid: currentUser.uid,
            email: ownerAccount.email || currentUser.email || ''
        };

        if (ownerAccount.uid !== currentUser.uid) {
            console.warn('OWNER_ONBOARDING_UID_MISMATCH_CORRECTED', {
                authUid: currentUser.uid,
                ownerAccountUid: ownerAccount.uid
            });
        }

        let submissionProperties: any[] = [];
        try {
            submissionProperties = (properties.length ? properties : []).map((property) => normalizePropertyForSubmission(property, currentUser.uid));
            if (submissionProperties.length === 0 || submissionProperties.some((property) => !property.geo?.point)) {
                setError('Please select the property location from Google Maps.');
                return;
            }
        } catch (err: any) {
            setError(err?.message || 'Please select the property location from Google Maps.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const idTokenResult = await currentUser.getIdTokenResult(true);
            const submissionId = `${currentUser.uid}_${onboardingSessionId}`;
            const contractId = `${submissionId}_contract`;
            const paymentTransactionId = `${submissionId}_mobilization`;
            const planCoverage = getPlanCoverage(selectedPlan);

            console.info('OWNER_ONBOARDING_SUBMIT_DEBUG', {
                authUid: currentUser.uid,
                claims: idTokenResult.claims,
                targetCallable: 'submitOwnerOnboarding',
                targetPaths: {
                    intake: `intake_submissions/${submissionId}`,
                    propertyPending: `properties_pending/${submissionProperties[0]?.propertyId || `${submissionId}_property`}`,
                    contract: `contracts/${contractId}`,
                    payment: `payment_transactions/${paymentTransactionId}`,
                    audit: `audit_logs/${submissionId}_submit`
                },
                payloadKeys: [
                    'idempotencyKey',
                    'onboardingSessionId',
                    'ownerAccount',
                    'contactInfo',
                    'companyProfile',
                    'properties',
                    'selectedPlan',
                    'selectedAddOns',
                    'portfolioSummary',
                    'pricing',
                    'payment',
                    'proofDocuments'
                ]
            });

            const uploadedProofDocuments = await uploadProofDocuments(submissionId, currentUser.uid);
            const submitOwnerOnboarding = httpsCallable(functions, 'submitOwnerOnboarding');
            const result = await submitOwnerOnboarding({
                idempotencyKey: submissionId,
                onboardingSessionId,
                ownerAccount: signedInOwnerAccount,
                contactInfo: {
                    contactPerson: signedInOwnerAccount.fullName || companyProfile.contactPerson,
                    email: signedInOwnerAccount.email || companyProfile.email,
                    phone: signedInOwnerAccount.mobile || companyProfile.phone
                },
                companyProfile,
                properties: submissionProperties,
                selectedPlan,
                servicePlan: {
                    id: selectedPlan?.id || 'hybrid',
                    name: selectedPlan?.name || selectedPlan?.packageName || 'Institutional Package',
                    coverage: planCoverage.included,
                    exclusions: planCoverage.excluded,
                    slaLevel: planCoverage.slaLevel
                },
                contractType: selectedPlan?.id || selectedPlan?.name || 'hybrid',
                selectedAddOns,
                addOns: selectedAddOns,
                proofDocuments: uploadedProofDocuments,
                portfolioSummary,
                pricing: {
                    annualContractValue: estimatedAnnualValue,
                    mobilizationPercent: 15,
                    mobilizationAmount,
                    currency: 'AED'
                },
                payment: {
                    method: paymentMethod,
                    state: 'PAYMENT_PENDING',
                    amount: mobilizationAmount,
                    currency: 'AED',
                    mobilizationPercent: 15
                }
            });

            const response = result.data as any;
            console.info('OWNER_ONBOARDING_SUBMIT_SUCCESS', {
                intakeId: response?.intakeId,
                propertyId: response?.propertyId,
                contractId: response?.contractId,
                paymentTransactionId: response?.paymentTransactionId,
                auditLogId: response?.auditLogId,
                status: response?.status
            });

            setSubmissionResult(response);
            setIntakeId(response?.intakeId || submissionId);
            setSubmitted(true);
        } catch (err: any) {
            console.error('OWNER_ONBOARDING_SUBMIT_FAILED', {
                code: err?.code || err?.name || 'unknown',
                message: err?.message || 'Unknown submission error',
                details: err?.details || null,
                authUid: auth.currentUser?.uid || null
            });
            setError(err?.message || 'Onboarding submission failed.');
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
                <CheckCircle2 size={88} color="#10b981" style={{ marginBottom: 24 }} />
                <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>
                    SUBMISSION SECURED
                </Typography>
                <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.62)', mb: 4 }}>
                    Your dashboard remains locked while admin verifies documents and the 15% mobilization payment.
                </Typography>
                {submissionResult && (
                    <Paper sx={{ p: 3, mb: 4, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'left' }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>ADMIN REVIEW IDS</Typography>
                        <Typography variant="body2">Intake: {submissionResult.intakeId}</Typography>
                        <Typography variant="body2">Property: {submissionResult.propertyId}</Typography>
                        <Typography variant="body2">Contract: {submissionResult.contractId}</Typography>
                        <Typography variant="body2">Payment: {submissionResult.paymentTransactionId}</Typography>
                    </Paper>
                )}
                <Button
                    variant="contained"
                    onClick={() => {
                        reset();
                        navigate('/dashboard');
                    }}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 5, py: 1.5 }}
                >
                    GO TO LOCKED DASHBOARD
                </Button>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 5 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    PAYMENT & SUBMISSION
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Confirm the selected protocol and submit for admin verification.
                </Typography>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.62)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Stack spacing={3}>
                            <Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>SELECTED CONTRACT</Typography>
                                <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{selectedPlan?.name || selectedPlan?.packageName || 'Institutional Package'}</Typography>
                                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                                    {(selectedPlan?.features || []).map((feature: string) => <Chip key={feature} label={feature} size="small" />)}
                                </Stack>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                            <Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>PORTFOLIO & ADD-ONS</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF' }}>Total Assets: {portfolioSummary?.totalProperties || properties.length}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF' }}>Total Units: {portfolioSummary?.totalUnits || 0}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF' }}>Total SqFt: {portfolioSummary?.totalSqFt || 0}</Typography>
                                {selectedAddOns.length > 0 && (
                                    <Box sx={{ mt: 1 }}>
                                        <Typography variant="caption" color="text.secondary">SELECTED ADD-ONS</Typography>
                                        <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 1 }}>
                                            {selectedAddOns.map(addon => <Chip key={addon} label={addon} size="small" variant="outlined" sx={{ color: '#FFF' }} />)}
                                        </Stack>
                                    </Box>
                                )}
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                            <Box>
                                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>CONTACT INFO</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF' }}>{ownerAccount?.fullName || companyProfile?.contactPerson}</Typography>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>{ownerAccount?.email || companyProfile?.email}</Typography>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>{ownerAccount?.mobile || companyProfile?.phone}</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">ANNUAL CONTRACT VALUE</Typography>
                                    <Typography variant="h6" fontWeight="950">{formatAED(estimatedAnnualValue)}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">15% MOBILIZATION</Typography>
                                    <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold }}>{formatAED(mobilizationAmount)}</Typography>
                                </Grid>
                            </Grid>
                            <TextField select fullWidth label="Payment Method" value={paymentMethod || ''} onChange={(e) => setPaymentMethod(e.target.value as any)}>
                                <MenuItem value="BANK_TRANSFER">Bank Transfer</MenuItem>
                                <MenuItem value="CHEQUE">Corporate Cheque</MenuItem>
                                <MenuItem value="CASH">Cash Payment</MenuItem>
                            </TextField>
                        </Stack>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(198,167,94,0.06)', border: `1px solid ${binThemeTokens.gold}` }}>
                        <Stack spacing={2}>
                            <ShieldCheck color={binThemeTokens.gold} size={32} />
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>ADMIN REVIEW LOCK</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                                Submission creates an intake, contract shell, and payment transaction. Live owner/property/unit records are only activated after admin approval.
                            </Typography>
                            {error && <Alert severity="error">{error}</Alert>}
                            <Button
                                variant="contained"
                                fullWidth
                                disabled={submitting}
                                onClick={handleSubmit}
                                startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <CreditCard size={18} />}
                                sx={{ mt: 2, py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                            >
                                {submitting ? 'SUBMITTING...' : 'SUBMIT ONBOARDING'}
                            </Button>
                            <Button onClick={onBack} startIcon={<ArrowLeft />} sx={{ color: 'rgba(255,255,255,0.52)', fontWeight: 800 }}>
                                BACK
                            </Button>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
};

export default PaymentSubmissionStep;
