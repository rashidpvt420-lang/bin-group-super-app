import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import {
    Box, Typography, Paper, Grid, TextField, Button, Select, MenuItem,
    InputLabel, FormControl, Stepper, Step, StepLabel, Divider,
    Stack, Chip, CircularProgress, Alert, InputAdornment, IconButton,
    Tooltip, Checkbox, FormControlLabel, Radio, RadioGroup
} from '@mui/material';
import {
    Building2, User, Phone, Mail, MapPin, Hash, Layers,
    ChevronLeft, ChevronRight, CheckCircle2, Send, Copy, ExternalLink,
    Shield, Zap, Settings, Info, Calculator, Package
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, collection, addDoc, serverTimestamp, doc, setDoc } from '../../../lib/firebase';
import { useRole } from '../../../context/RoleContext';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';
import { generateSmartQuote, type QuoteInputs } from '../../../utils/uaePricingEngine_v2';
import { BIN_CONTRACT_TYPES, MAJLIS_MAINTENANCE_PACKAGES, SERVICE_ADDONS } from '../../../utils/uaePricingMatrix2026';

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Fujairah', 'Ras Al Khaimah', 'Umm Al Quwain'];
const PROPERTY_TYPES = [
    'RESIDENTIAL', 'VILLA', 'COMMERCIAL', 'MAJLIS', 'GOVERNMENT_MAJLIS',
    'HOTEL', 'MALL', 'HOSPITAL', 'STADIUM', 'MIXED_USE'
];
const STEPS = ['Property Details', 'Owner Information', 'Contract & Pricing', 'Units & Access', 'Review & Send'];

export default function AddPropertyPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState<{ propertyId: string; inviteLink: string } | null>(null);
    const [error, setError] = useState('');

    // Step 1: Property
    const [propertyName, setPropertyName] = useState('');
    const [propertyType, setPropertyType] = useState('RESIDENTIAL');
    const [emirate, setEmirate] = useState('Dubai');
    const [address, setAddress] = useState('');
    const [floors, setFloors] = useState('');
    const [units, setUnits] = useState('');
    const [lifts, setLifts] = useState('');
    const [shops, setShops] = useState('');
    const [sqft, setSqft] = useState('');
    const [buildingAge, setBuildingAge] = useState('');
    const [sector, setSector] = useState('RESIDENTIAL');
    const [assetGrade, setAssetGrade] = useState<'Standard' | 'Premium' | 'Luxury' | 'Ultra-Luxury' | 'Sovereign'>('Standard');
    const [document, setDocument] = useState<File | null>(null);

    // Step 2: Owner
    const [ownerName, setOwnerName] = useState('');
    const [ownerEmail, setOwnerEmail] = useState('');
    const [ownerPhone, setOwnerPhone] = useState('');
    const [ownerNationality, setOwnerNationality] = useState('');
    const [ownerEmirates, setOwnerEmirates] = useState('');

    // Step 3: Contract & Pricing
    const [contractType, setContractType] = useState<any>('FM_ONLY');
    const [majlisPackageId, setMajlisPackageId] = useState('majlis-basic');
    const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
    const [slaTier, setSlaTier] = useState<any>('SLA_STANDARD');

    // Real-time Quote Calculation
    const isMajlis = useMemo(() => propertyType.toLowerCase().includes('majlis'), [propertyType]);
    
    // Auto-set contract type for Majlis
    useEffect(() => {
        if (isMajlis) setContractType('FM_ONLY');
    }, [isMajlis]);

    const quoteResult = useMemo(() => {
        const inputs: QuoteInputs = {
            propertyType,
            sqft: parseFloat(sqft) || 1200,
            age: parseInt(buildingAge) || 5,
            floors: parseInt(floors) || 1,
            units: parseInt(units) || 1,
            hvacType: 'DX', // Default for now
            liftCount: parseInt(lifts) || 0,
            pool: false,
            landscape: 'Low',
            assetGrade,
            contractType,
            majlisPackageId: isMajlis ? majlisPackageId : undefined,
            selectedAddons,
            slaTier
        };
        return generateSmartQuote(inputs);
    }, [propertyType, sqft, buildingAge, floors, units, lifts, assetGrade, contractType, majlisPackageId, selectedAddons, slaTier, isMajlis]);

    const inviteToken = saved?.inviteLink || '';

    const canGoNext = () => {
        if (step === 0) return propertyName && emirate && floors && units;
        if (step === 1) return ownerName && ownerEmail;
        if (step === 2) return contractType;
        return true;
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            const token = `OWN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
            const inviteLink = `https://bin-groups.com/login?invite=${token}&role=owner`;

            // 1. Create property
            const propRef = await addDoc(collection(db, 'properties'), {
                name: propertyName,
                propertyName,
                propertyType,
                emirate,
                address,
                floors: parseInt(floors) || 0,
                unitsCount: parseInt(units) || 0,
                lifts: parseInt(lifts) || 0,
                shops: parseInt(shops) || 0,
                sqft: parseFloat(sqft) || 0,
                buildingAge: parseInt(buildingAge) || 0,
                sector,
                assetGrade,
                hasTitleDeed: document !== null,
                ownerName,
                ownerEmail,
                ownerPhone,
                status: 'ACTIVE',
                createdBy: user?.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            // 2. Create contract
            const contractRef = await addDoc(collection(db, 'contracts'), {
                propertyId: propRef.id,
                propertyName,
                ownerId: null, // Linked later
                ownerName,
                ownerEmail,
                contractType,
                selectedPlan: quoteResult.selectedPackage || { id: 'standard', label: 'Standard Asset Care' },
                slaTier,
                selectedAddons,
                annualValue: quoteResult.totalAnnualPrice,
                baseAnnualValue: quoteResult.baseAnnualPrice,
                addonValue: quoteResult.addonTotal,
                complexityScore: quoteResult.complexityScore,
                recommendedTier: quoteResult.recommendedTier,
                status: 'PENDING',
                notes: quoteResult.guidanceNotes,
                createdAt: serverTimestamp(),
            });

            // 3. Create owner invite record
            await setDoc(doc(db, 'ownerInvites', token), {
                token,
                ownerName,
                ownerEmail,
                ownerPhone,
                ownerNationality,
                ownerEmiratesId: ownerEmirates,
                propertyId: propRef.id,
                contractId: contractRef.id,
                propertyName,
                inviteLink,
                status: 'PENDING',
                createdBy: user?.uid,
                createdAt: serverTimestamp(),
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            });

            // 4. Create owner user record
            await addDoc(collection(db, 'users'), {
                displayName: ownerName,
                email: ownerEmail,
                phone: ownerPhone,
                role: 'owner',
                propertyId: propRef.id,
                propertyName,
                inviteToken: token,
                onboardingComplete: false,
                status: 'INVITED',
                createdBy: user?.uid,
                createdAt: serverTimestamp(),
            });

            // 5. Create default units
            const unitCount = parseInt(units) || 0;
            for (let i = 1; i <= Math.min(unitCount, 100); i++) {
                const unitFloor = Math.ceil(i / Math.max(Math.floor(unitCount / (parseInt(floors) || 1)), 1));
                await addDoc(collection(db, 'units'), {
                    propertyId: propRef.id,
                    propertyName,
                    unitNumber: `${unitFloor < 10 ? '0' : ''}${unitFloor}0${i < 10 ? '0' : ''}${i}`.slice(-4),
                    floorNumber: unitFloor,
                    status: 'VACANT',
                    tenantId: null,
                    createdAt: serverTimestamp(),
                });
            }

            // 6. Create Property Passport
            await setDoc(doc(db, 'propertyPassports', propRef.id), {
                propertyId: propRef.id,
                propertyName,
                ownerId: null,
                ownerName,
                ownerEmail,
                totalUnits: parseInt(units) || 0,
                occupiedUnits: 0,
                rentCollectedTotal: 0,
                rentOutstandingTotal: 0,
                passportStatus: 'INITIALIZING',
                createdAt: serverTimestamp(),
            });

            // 7. Audit log
            await addDoc(collection(db, 'auditLogs'), {
                action: 'PROPERTY_CREATED',
                actorId: user?.uid,
                actorRole: 'admin',
                resourceType: 'property',
                resourceId: propRef.id,
                metadata: { propertyName, ownerEmail, units, contractType, annualValue: quoteResult.totalAnnualPrice },
                timestamp: serverTimestamp(),
            });

            setSaved({ propertyId: propRef.id, inviteLink });
            setStep(5);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to save property');
        } finally {
            setSaving(false);
        }
    };

    const inputSx = {
        '& .MuiOutlinedInput-root': {
            bgcolor: 'rgba(255,255,255,0.03)',
            borderRadius: 2,
            '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
            '&:hover fieldset': { borderColor: binThemeTokens.gold },
            '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold },
        },
        '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
        '& .MuiInputBase-input': { color: '#FFF' },
        '& .MuiSelect-icon': { color: 'rgba(255,255,255,0.5)' },
    };

    return (
        <AdminPageFrame title="Add Property" breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Add Property' }]}>
            <Box sx={{ maxWidth: 1000, mx: 'auto' }}>

                {/* Stepper */}
                {step < 5 && (
                    <Stepper activeStep={step} sx={{ mb: 5 }}>
                        {STEPS.map((label, i) => (
                            <Step key={label} completed={step > i}>
                                <StepLabel
                                    sx={{
                                        '& .MuiStepLabel-label': { color: step >= i ? binThemeTokens.gold : 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' },
                                        '& .MuiStepIcon-root': { color: step >= i ? binThemeTokens.gold : 'rgba(255,255,255,0.1)' },
                                    }}
                                >{label}</StepLabel>
                            </Step>
                        ))}
                    </Stepper>
                )}

                {/* STEP 0: Property Details */}
                {step === 0 && (
                    <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                            <Building2 color={binThemeTokens.gold} size={24} />
                            <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>Property Details</Typography>
                        </Stack>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={8}>
                                <TextField fullWidth label="Property Name *" value={propertyName} onChange={e => setPropertyName(e.target.value)} sx={inputSx} />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth sx={inputSx}>
                                    <InputLabel>Property Type *</InputLabel>
                                    <Select value={propertyType} onChange={e => setPropertyType(e.target.value)} label="Property Type *">
                                        {PROPERTY_TYPES.map(t => <MenuItem key={t} value={t} sx={{ color: '#FFF', bgcolor: '#111' }}>{t.replace('_', ' ')}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth sx={inputSx}>
                                    <InputLabel>Asset Grade *</InputLabel>
                                    <Select value={assetGrade} onChange={e => setAssetGrade(e.target.value as any)} label="Asset Grade *">
                                        {['Standard', 'Premium', 'Luxury', 'Ultra-Luxury', 'Sovereign'].map(g => <MenuItem key={g} value={g} sx={{ color: '#FFF', bgcolor: '#111' }}>{g}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth sx={inputSx}>
                                    <InputLabel>Emirate *</InputLabel>
                                    <Select value={emirate} onChange={e => setEmirate(e.target.value)} label="Emirate *">
                                        {EMIRATES.map(e => <MenuItem key={e} value={e} sx={{ color: '#FFF', bgcolor: '#111' }}>{e}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth sx={inputSx}>
                                    <InputLabel>Sector *</InputLabel>
                                    <Select value={sector} onChange={e => setSector(e.target.value)} label="Sector *">
                                        {['COMMERCIAL', 'RESIDENTIAL', 'GOVERNMENT', 'INDUSTRIAL', 'RETAIL'].map(s => <MenuItem key={s} value={s} sx={{ color: '#FFF', bgcolor: '#111' }}>{s}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12}>
                                <TextField fullWidth label="Full Address" value={address} onChange={e => setAddress(e.target.value)} sx={inputSx} />
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <TextField fullWidth label="Floors *" type="number" value={floors} onChange={e => setFloors(e.target.value)} sx={inputSx} />
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <TextField fullWidth label="Total Units *" type="number" value={units} onChange={e => setUnits(e.target.value)} sx={inputSx} />
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <TextField fullWidth label="Lifts" type="number" value={lifts} onChange={e => setLifts(e.target.value)} sx={inputSx} />
                            </Grid>
                            <Grid item xs={6} md={3}>
                                <TextField fullWidth label="Building Age (years)" type="number" value={buildingAge} onChange={e => setBuildingAge(e.target.value)} sx={inputSx} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField fullWidth label="Total Size (sqft)" type="number" value={sqft} onChange={e => setSqft(e.target.value)} sx={inputSx}
                                    InputProps={{ endAdornment: <InputAdornment position="end"><Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>sqft</Typography></InputAdornment> }} />
                            </Grid>
                        </Grid>
                    </Paper>
                )}

                {/* STEP 1: Owner Info */}
                {step === 1 && (
                    <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                            <User color={binThemeTokens.gold} size={24} />
                            <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>Owner Information</Typography>
                        </Stack>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Owner Full Name *" value={ownerName} onChange={e => setOwnerName(e.target.value)} sx={inputSx} />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Owner Email *" type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} sx={inputSx} />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Phone / WhatsApp" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} sx={inputSx} />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Nationality" value={ownerNationality} onChange={e => setOwnerNationality(e.target.value)} sx={inputSx} />
                            </Grid>
                        </Grid>
                    </Paper>
                )}

                {/* STEP 2: Contract & Pricing */}
                {step === 2 && (
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={7}>
                            <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                                    <Shield color={binThemeTokens.gold} size={24} />
                                    <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>Contract Strategy</Typography>
                                </Stack>

                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, display: 'block', mb: 2 }}>SELECT CONTRACT TYPE</Typography>
                                <RadioGroup value={contractType} onChange={e => setContractType(e.target.value)}>
                                    <Grid container spacing={2}>
                                        {Object.entries(BIN_CONTRACT_TYPES).map(([key, label]) => {
                                            const disabled = isMajlis && key !== 'FM_ONLY';
                                            return (
                                                <Grid item xs={12} key={key}>
                                                    <Box sx={{ 
                                                        p: 2, borderRadius: 3, border: '1px solid',
                                                        borderColor: contractType === key ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                                        bgcolor: contractType === key ? 'rgba(198,167,94,0.05)' : 'transparent',
                                                        opacity: disabled ? 0.4 : 1,
                                                        pointerEvents: disabled ? 'none' : 'auto',
                                                        cursor: 'pointer'
                                                    }} onClick={() => !disabled && setContractType(key)}>
                                                        <FormControlLabel 
                                                            value={key} 
                                                            control={<Radio sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }} />} 
                                                            label={<Typography variant="body2" fontWeight="900" sx={{ color: '#FFF' }}>{label}</Typography>} 
                                                        />
                                                        {disabled && <Typography variant="caption" sx={{ color: '#ef4444', display: 'block', mt: 0.5, ml: 4 }}>Restricted for Majlis property type</Typography>}
                                                    </Box>
                                                </Grid>
                                            );
                                        })}
                                    </Grid>
                                </RadioGroup>

                                {isMajlis && (
                                    <Box sx={{ mt: 4 }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, display: 'block', mb: 2 }}>MAJLIS MAINTENANCE PACKAGE</Typography>
                                        <Stack spacing={2}>
                                            {MAJLIS_MAINTENANCE_PACKAGES.map(pkg => (
                                                <Box key={pkg.id} sx={{ 
                                                    p: 2, borderRadius: 3, border: '1px solid',
                                                    borderColor: majlisPackageId === pkg.id ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                                    bgcolor: majlisPackageId === pkg.id ? 'rgba(198,167,94,0.05)' : 'transparent',
                                                    cursor: 'pointer'
                                                }} onClick={() => setMajlisPackageId(pkg.id)}>
                                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="900" sx={{ color: '#FFF' }}>{pkg.label}</Typography>
                                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Base: AED {pkg.basePrice.toLocaleString()}/yr</Typography>
                                                        </Box>
                                                        {majlisPackageId === pkg.id && <CheckCircle2 size={18} color={binThemeTokens.gold} />}
                                                    </Stack>
                                                </Box>
                                            ))}
                                        </Stack>
                                    </Box>
                                )}

                                <Box sx={{ mt: 4 }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, display: 'block', mb: 2 }}>{t('common.sla_label').toUpperCase()}</Typography>
                                    <FormControl fullWidth sx={inputSx}>
                                        <Select value={slaTier} onChange={e => setSlaTier(e.target.value)}>
                                            <MenuItem value="SLA_BASIC">{t('common.sla_basic')}</MenuItem>
                                            <MenuItem value="SLA_STANDARD">Standard Enterprise (24h Response)</MenuItem>
                                            <MenuItem value="SLA_GOLD">Gold Premium (4h Response)</MenuItem>
                                            <MenuItem value="SLA_PLATINUM">Platinum Sovereign (2h Response)</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Box>

                                <Box sx={{ mt: 4 }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, display: 'block', mb: 2 }}>SERVICE ADD-ONS</Typography>
                                    <Grid container spacing={1}>
                                        {SERVICE_ADDONS.map(addon => (
                                            <Grid item xs={6} key={addon.id}>
                                                <FormControlLabel
                                                    control={<Checkbox 
                                                        checked={selectedAddons.includes(addon.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setSelectedAddons([...selectedAddons, addon.id]);
                                                            else setSelectedAddons(selectedAddons.filter(a => a !== addon.id));
                                                        }}
                                                        sx={{ color: 'rgba(255,255,255,0.2)', '&.Mui-checked': { color: binThemeTokens.gold } }}
                                                    />}
                                                    label={<Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>{addon.label}</Typography>}
                                                />
                                            </Grid>
                                        ))}
                                    </Grid>
                                </Box>
                            </Paper>
                        </Grid>

                        <Grid item xs={12} md={5}>
                            <Paper sx={{ p: 4, bgcolor: 'rgba(198,167,94,0.03)', border: '1px solid rgba(198,167,94,0.2)', borderRadius: 4, position: 'sticky', top: 20 }}>
                                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                                    <Calculator color={binThemeTokens.gold} size={24} />
                                    <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold }}>BIN-GENESIS QUOTE</Typography>
                                </Stack>

                                <Stack spacing={2} sx={{ mb: 4 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>Base Asset Fee</Typography>
                                        <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>AED {quoteResult.baseAnnualPrice.toLocaleString()}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>Complexity Adjustment</Typography>
                                        <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 700 }}>+AED {quoteResult.riskAdjustment.toLocaleString()}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>Service Add-ons</Typography>
                                        <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>AED {quoteResult.addonTotal?.toLocaleString()}</Typography>
                                    </Box>
                                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1 }}>
                                        <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 900 }}>Total Annual</Typography>
                                        <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>AED {quoteResult.totalAnnualPrice.toLocaleString()}</Typography>
                                    </Box>
                                </Stack>

                                <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
                                    <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                                        <Info size={14} color={binThemeTokens.gold} />
                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>COMPLEXITY SCORE: {quoteResult.complexityScore}/100</Typography>
                                    </Stack>
                                    {quoteResult.guidanceNotes.map((note, i) => (
                                        <Typography key={i} variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mb: 0.5 }}>• {note}</Typography>
                                    ))}
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                )}

                {/* STEP 3: Units Preview */}
                {step === 3 && (
                    <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                         <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
                            <Layers color={binThemeTokens.gold} size={24} />
                            <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF' }}>Units & Asset Scale</Typography>
                        </Stack>
                        <Alert severity="success" sx={{ mb: 3, bgcolor: 'rgba(16,185,129,0.1)', color: '#4ade80', border: '1px solid rgba(16,185,129,0.2)' }}>
                            {units} units will be auto-generated across {floors} floors. Total valuation AED {quoteResult.totalAnnualPrice.toLocaleString()}.
                        </Alert>
                        {/* Summary cards similar to before */}
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>PROPERTY</Typography>
                                    <Typography variant="h6" sx={{ color: '#FFF' }}>{propertyName}</Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>{propertyType.replace('_', ' ')} · {emirate}</Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>CONTRACT</Typography>
                                    <Typography variant="h6" sx={{ color: '#FFF' }}>{BIN_CONTRACT_TYPES[contractType as keyof typeof BIN_CONTRACT_TYPES]}</Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>SLA Tier: {slaTier.replace('_', ' ')}</Typography>
                                </Box>
                            </Grid>
                        </Grid>
                    </Paper>
                )}

                {/* STEP 4: Review */}
                {step === 4 && (
                    <Paper sx={{ p: 4, bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                        <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF', mb: 3 }}>Final Review</Typography>
                        <Grid container spacing={2}>
                            {[
                                ['Property', propertyName], ['Type', propertyType], ['Contract', contractType],
                                ['Owner', ownerName], ['Email', ownerEmail], ['Annual Value', `AED ${quoteResult.totalAnnualPrice.toLocaleString()}`],
                                ['SLA', slaTier], ['Units', units], ['Floors', floors]
                            ].map(([label, val]) => (
                                <Grid item xs={12} md={6} key={label}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{label}</Typography>
                                        <Typography variant="caption" sx={{ color: '#FFF', fontWeight: 900 }}>{val || '—'}</Typography>
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                )}

                {/* STEP 5: Saved */}
                {step === 5 && saved && (
                    <Paper sx={{ p: 5, bgcolor: 'rgba(22,22,24,0.8)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4, textAlign: 'center' }}>
                        <CheckCircle2 color="#4ade80" size={56} style={{ margin: '0 auto 16px' }} />
                        <Typography variant="h5" fontWeight="900" sx={{ color: '#FFF', mb: 1 }}>Sovereign Asset Initialized</Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 4 }}>
                            Contract value: AED {quoteResult.totalAnnualPrice.toLocaleString()} · Owner invited to portal
                        </Typography>
                        
                        <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)', mb: 3, textAlign: 'left' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mb: 1 }}>PORTAL INVITE LINK</Typography>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="body2" sx={{ color: '#FFF', flex: 1, wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    {saved.inviteLink}
                                </Typography>
                                <IconButton size="small" onClick={() => navigator.clipboard.writeText(saved.inviteLink)} sx={{ color: binThemeTokens.gold }}>
                                    <Copy size={16} />
                                </IconButton>
                            </Stack>
                        </Box>

                        <Stack direction="row" spacing={2} justifyContent="center">
                            <Button variant="contained" onClick={() => navigate('/admin/contracts')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>View Contract Registry</Button>
                            <Button variant="outlined" onClick={() => setStep(0)} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#FFF' }}>Add Another</Button>
                        </Stack>
                    </Paper>
                )}

                {/* Navigation Buttons */}
                {step < 5 && (
                    <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
                        <Button
                            variant="outlined"
                            startIcon={<ChevronLeft size={18} />}
                            onClick={() => step === 0 ? navigate('/admin') : setStep(s => s - 1)}
                            sx={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontWeight: 900, px: 4, borderRadius: 3 }}
                        >
                            {step === 0 ? 'Cancel' : 'Back'}
                        </Button>
                        {step < 4 ? (
                            <Button
                                variant="contained"
                                endIcon={<ChevronRight size={18} />}
                                onClick={() => setStep(s => s + 1)}
                                disabled={!canGoNext()}
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 4, borderRadius: 3 }}
                            >
                                Continue
                            </Button>
                        ) : (
                            <Button
                                variant="contained"
                                startIcon={saving ? <CircularProgress size={16} sx={{ color: '#000' }} /> : <CheckCircle2 size={18} />}
                                onClick={handleSave}
                                disabled={saving}
                                sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 900, px: 6, borderRadius: 3 }}
                            >
                                {saving ? 'Creating...' : 'Initialize Asset & Contract'}
                            </Button>
                        )}
                    </Stack>
                )}
            </Box>
        </AdminPageFrame>
    );
}

