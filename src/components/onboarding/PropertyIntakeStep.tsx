import React, { useState, useEffect, useRef } from 'react';
import { 
    Box, Typography, Grid, TextField, MenuItem, FormControl, InputLabel, Select, Paper, Divider,
    Stack, Button, Chip, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    alpha, Checkbox, FormControlLabel, Tabs, Tab, Alert, styled
} from '@mui/material';
import { 
    Building2, Plus, Trash2, FileSpreadsheet, ArrowRight, MapPin, AlertCircle, Info, ShieldAlert,
    Landmark, Gem, Workflow, Hotel, School, Briefcase, Home
} from 'lucide-react';
import { useOnboardingStore, type PropertyData } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { db, collection, addDoc, serverTimestamp } from '../../lib/firebase';
import { formatNumber, formatAED } from '../../utils/formatters';
import Papa from 'papaparse';
import { useGoogleMaps } from '../../lib/maps';

const VisuallyHiddenInput = styled('input')({
    clip: 'rect(0 0 0 0)',
    clipPath: 'inset(50%)',
    height: 1,
    overflow: 'hidden',
    position: 'absolute',
    bottom: 0,
    left: 0,
    whiteSpace: 'nowrap',
    width: 1,
});

const PropertyIntakeStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
    const { 
        properties, addProperty, removeProperty, updateProperty, calculateSummary, 
        portfolioSummary, bulkAddProperties, intakeId, setIntakeId, companyProfile
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const { isLoaded } = useGoogleMaps();
    const [editingIndex, setEditingIndex] = useState<number | null>(0);
    const [tabValue, setTabValue] = useState(0); 
    const autocompleteRef = useRef<HTMLInputElement>(null);
    const googleAutocompleteRef = useRef<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isLoaded) return;
        let autocomplete: any = null;

        const initAutocomplete = async () => {
            if (tabValue === 0 && editingIndex !== null && autocompleteRef.current) {
                try {
                    // Use modern importLibrary for robust dynamic loading
                    const { Autocomplete } = await (window as any).google.maps.importLibrary("places") as any;
                    
                    autocomplete = new Autocomplete(autocompleteRef.current, {
                        componentRestrictions: { country: "ae" },
                        fields: ["address_components", "geometry", "formatted_address"],
                        types: ["address"]
                    });

                    autocomplete.addListener("place_changed", () => {
                        const place = autocomplete.getPlace();
                        if (!place.geometry) return;

                        const address = place.formatted_address;
                        let emirate = 'Dubai';
                        let area = '';

                        // Extract Emirate and Area from address components
                        for (const component of place.address_components) {
                            if (component.types.includes("administrative_area_level_1")) {
                                emirate = component.long_name.replace('Emirate of ', '').replace(' Emirate', '');
                            }
                            if (component.types.includes("sublocality") || component.types.includes("neighborhood")) {
                                area = component.long_name;
                            }
                        }

                        updateProperty(editingIndex!, { 
                            address, 
                            emirate, 
                            area: area || activeProperty?.area,
                            location: {
                                lat: place.geometry.location.lat(),
                                lng: place.geometry.location.lng()
                            }
                        });
                    });
                    
                    googleAutocompleteRef.current = autocomplete;
                } catch (e) {
                    console.error("Google Autocomplete Init Failed:", e);
                }
            }
        };

        initAutocomplete();

        return () => {
            if (googleAutocompleteRef.current) {
                (window as any).google.maps.event.clearInstanceListeners(googleAutocompleteRef.current);
            }
        };
    }, [tabValue, editingIndex, isLoaded]);

    const safeProperties = Array.isArray(properties) ? properties : [];

    const handleProceed = async () => {
        if (safeProperties.length === 0) return;
        try {
            if (!intakeId) {
                const docRef = await addDoc(collection(db, 'intake_submissions'), {
                    properties: safeProperties, portfolioSummary, contactInfo: companyProfile,
                    status: 'PENDING', createdAt: serverTimestamp(), source: 'frontend_wizard_v1.20'
                });
                setIntakeId(docRef.id);
            }
            onNext();
        } catch (error) {
            onNext();
        }
    };

    const handleAddProperty = () => {
        if (safeProperties.length >= 500) return;
        addProperty();
        setEditingIndex(safeProperties.length);
    };

    const handleFileSelect = () => fileInputRef.current?.click();

    const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: (results: any) => {
                const parsedData = results.data as any[];
                if (!Array.isArray(parsedData) || parsedData.length === 0) return;
                const newProps: PropertyData[] = parsedData.slice(0, 500).map((row, i) => ({
                    id: `bulk-${i}-${Date.now()}`,
                    emirate: row.Emirate || 'Dubai',
                    area: row.Area || '',
                    zone: (row.Zone || 'B') as any,
                    propertyType: row.PropertyType || 'Residential',
                    subType: row.SubType || 'Apartment',
                    useType: (row.UseType || 'Rental') as any,
                    ownerType: (row.OwnerType || 'Private') as any,
                    floors: parseInt(row.Floors) || 1,
                    units: parseInt(row.Units) || 1,
                    bedrooms: parseInt(row.Bedrooms) || 1,
                    bathrooms: parseInt(row.Bathrooms) || 1,
                    sqft: parseInt(row.SqFt) || 1200,
                    age: parseInt(row.Age) || 5,
                    annualRent: parseInt(row.AnnualRent) || 0,
                    annualRevenue: parseInt(row.AnnualRevenue) || 0,
                    shops: parseInt(row.Shops) || 0,
                    offices: parseInt(row.Offices) || 0,
                    rooms: parseInt(row.Rooms) || 0,
                    pool: row.HasPool?.toLowerCase() === 'true',
                    lifts: parseInt(row.Lifts) || 0,
                    tank: row.HasTank?.toLowerCase() === 'true',
                    bmu: row.HasBmu?.toLowerCase() === 'true',
                    sira: row.HasSira?.toLowerCase() === 'true',
                    fireAlarm: row.HasFireAlarm?.toLowerCase() === 'true',
                    firePump: row.HasFirePump?.toLowerCase() === 'true',
                    escalators: row.HasEscalators?.toLowerCase() === 'true',
                    centralLPG: row.HasLpg?.toLowerCase() === 'true',
                    wasteMan: row.HasWasteMan?.toLowerCase() === 'true',
                    gen: row.HasGen?.toLowerCase() === 'true',
                    hvac: row.HasHvac?.toLowerCase() === 'true',
                    districtCooling: row.HasDistrictCooling?.toLowerCase() === 'true',
                    electrical: row.HasElectrical?.toLowerCase() !== 'false',
                    plumbing: row.HasPlumbing?.toLowerCase() !== 'false',
                    drainage: row.HasDrainage?.toLowerCase() !== 'false',
                    pumps: row.HasPumps?.toLowerCase() !== 'false',
                    emergencyLighting: row.HasEmergencyLighting?.toLowerCase() === 'true',
                    accessControl: row.HasAccessControl?.toLowerCase() === 'true',
                    bms: row.HasBms?.toLowerCase() === 'true',
                    iotSensors: row.HasIotSensors?.toLowerCase() === 'true',
                    gym: row.HasGym?.toLowerCase() === 'true',
                    majlis: row.IsMajlis?.toLowerCase() === 'true',
                    majlisType: (row.MajlisType || 'none') as any,
                    assetGrade: (row.AssetGrade || 'Premium') as any,
                    address: row.Address || `${row.Area}, ${row.Emirate}`,
                    condition: (row.Condition || 'Good') as any,
                    currentStatus: 'Active',
                    missions: [],
                    majlisSubtype: row.MajlisSubtype || '',
                    majlisGarden: row.HasMajlisGarden?.toLowerCase() === 'true',
                    heritageSensitivity: (row.HeritageSensitivity || 'Standard') as any,
                    guestCapacity: parseInt(row.GuestCapacity) || 0,
                    parkingCapacity: parseInt(row.ParkingCapacity) || 0,
                    hospitalityReadiness: row.HasHospitality?.toLowerCase() === 'true',
                    irrigationSystem: row.HasIrrigation?.toLowerCase() === 'true',
                    solarIntegration: row.HasSolar?.toLowerCase() === 'true',
                    evReadiness: row.HasEv?.toLowerCase() === 'true',
                    securityLevel: (row.SecurityLevel || 'Standard') as any,
                    protocolLevel: (row.ProtocolLevel || 'Standard') as any,
                    publicGathering: row.HasPublicGathering?.toLowerCase() === 'true',
                    governmentUse: row.IsGovernmentUse?.toLowerCase() === 'true',
                    eventUse: row.IsEventUse?.toLowerCase() === 'true',
                    strategy: (row.Strategy || 'fm') as any,
                    slaTier: (row.SlaTier || 'standard') as any,
                    paymentPlan: (row.PaymentPlan || 'annual') as any,
                }));
                bulkAddProperties(newProps);
                setTabValue(0);
                setEditingIndex(0);
            }
        });
    };

    const activeProperty = editingIndex !== null ? safeProperties[editingIndex] : null;

    return (
        <Grid container spacing={4} sx={{ mt: 2 }}>
            <Grid item xs={12} md={8}>
                <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <Box>
                        <Typography variant="h3" fontWeight="900" sx={{ mb: 1, textTransform: 'uppercase' }}>{t('onboarding.bulk_intake')}</Typography>
                        <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 400 }}>{t('intake.identification')}</Typography>
                    </Box>
                    <Chip icon={<Building2 size={16} />} label={`${safeProperties.length} / 500 ${t('common.assets')}`} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 2, py: 2.5, borderRadius: 2 }} />
                </Box>

                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 3 }}>
                    <Tab label={t('button.manual_entry')} icon={<Plus size={18} />} iconPosition="start" />
                    <Tab label={t('button.bulk_csv')} icon={<FileSpreadsheet size={18} />} iconPosition="start" />
                </Tabs>
