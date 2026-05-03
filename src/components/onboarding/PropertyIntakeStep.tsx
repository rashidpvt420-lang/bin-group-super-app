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
import { useOnboardingStore, PropertyData } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { db, collection, addDoc, serverTimestamp } from '../../lib/firebase';
import { formatNumber, formatAED } from '../../utils/formatters';
import Papa from 'papaparse';

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
    const [editingIndex, setEditingIndex] = useState<number | null>(0);
    const [tabValue, setTabValue] = useState(0); 
    const autocompleteRef = useRef<HTMLInputElement>(null);
    const googleAutocompleteRef = useRef<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
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
                            // @ts-ignore: location is defined in some local types but TS complains
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
    }, [tabValue, editingIndex]);

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
            complete: (results) => {
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
                    sira: row.HasSira?.toLowerCase() === 'true',
                    fireAlarm: row.HasFireAlarm?.toLowerCase() === 'true',
                    majlis: row.IsMajlis?.toLowerCase() === 'true',
                    majlisType: (row.MajlisType || 'none') as any,
                    assetGrade: (row.AssetGrade || 'Premium') as any,
                    address: row.Address || `${row.Area}, ${row.Emirate}`,
                    condition: (row.Condition || 'Good') as any,
                    currentStatus: 'Active',
                    missions: [],
                    bmu: row.HasBmu?.toLowerCase() === 'true',
                    firePump: row.HasFirePump?.toLowerCase() === 'true',
                    escalators: row.HasEscalators?.toLowerCase() === 'true',
                    centralLPG: row.HasLpg?.toLowerCase() === 'true',
                    wasteMan: row.HasWasteMan?.toLowerCase() === 'true',
                    gen: row.HasGen?.toLowerCase() === 'true',
                    hvac: row.HasHvac?.toLowerCase() === 'true',
                    districtCooling: row.HasDistrictCooling?.toLowerCase() === 'true',
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

                {tabValue === 0 && (
                    <Paper sx={{ p: 3, borderRadius: 4, mb: 4, bgcolor: 'background.paper', border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                        <TableContainer sx={{ maxHeight: 400 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.2)', fontWeight: 900 }}>{t('field.property')}</TableCell>
                                        <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.2)', fontWeight: 900 }}>{t('field.type')}</TableCell>
                                        <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.2)', fontWeight: 900 }}>{t('field.units')}</TableCell>
                                        <TableCell align="right" sx={{ bgcolor: 'rgba(0,0,0,0.2)', fontWeight: 900 }}>{t('common.action')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {safeProperties.map((prop, index) => (
                                        <TableRow key={index} hover onClick={() => setEditingIndex(index)} sx={{ cursor: 'pointer', bgcolor: editingIndex === index ? alpha(binThemeTokens.gold, 0.1) : 'transparent' }}>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="900">{prop.address || `${t('common.asset')} #${index + 1}`}</Typography>
                                                <Typography variant="caption" color="text.secondary">{prop.area}, {prop.emirate}</Typography>
                                            </TableCell>
                                            <TableCell><Chip label={prop.propertyType} size="small" variant="outlined" /></TableCell>
                                            <TableCell><Typography variant="body2" fontWeight="700">{prop.units}</Typography></TableCell>
                                            <TableCell align="right">
                                                <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); removeProperty(index); if (editingIndex === index) setEditingIndex(null); }}><Trash2 size={16} /></IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <Button fullWidth variant="outlined" sx={{ mt: 2, borderStyle: 'dashed' }} onClick={handleAddProperty} startIcon={<Plus />}>{t('button.add_property')}</Button>
                    </Paper>
                )}

                {activeProperty && (
                    <Paper sx={{ p: 4, borderRadius: 4, border: `1px solid ${binThemeTokens.gold}` }}>
                        <Typography variant="h5" fontWeight="900" sx={{ mb: 4, borderLeft: `4px solid ${binThemeTokens.gold}`, pl: 2 }}>
                            {t('onboarding.asset_details')}: {activeProperty.address || `${t('common.asset')} #${(editingIndex || 0) + 1}`}
                        </Typography>

                        <Grid container spacing={3}>
                            <Grid item xs={12} sm={6}><TextField fullWidth label={t('field.emirate')} select value={activeProperty.emirate} onChange={(e) => updateProperty(editingIndex!, { emirate: e.target.value })}>{['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'RAK', 'Fujairah', 'UAQ'].map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}</TextField></Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField 
                                    fullWidth 
                                    label={t('field.area')} 
                                    value={activeProperty.area} 
                                    onChange={(e) => updateProperty(editingIndex!, { area: e.target.value })} 
                                    inputRef={autocompleteRef}
                                    placeholder="Search address or area..."
                                />
                            </Grid>

                            <Grid item xs={12} sm={4}>
                                <TextField fullWidth label={t('field.type')} select value={activeProperty.propertyType} onChange={(e) => updateProperty(editingIndex!, { propertyType: e.target.value })}>
                                    {/* Standard Categories */}
                                    <MenuItem value="Villa">Villa</MenuItem>
                                    <MenuItem value="Apartment">Apartment</MenuItem>
                                    <MenuItem value="Residential Building">Residential Building</MenuItem>
                                    <MenuItem value="Office">Office</MenuItem>
                                    <MenuItem value="Commercial Building">Commercial Building</MenuItem>
                                    <MenuItem value="Warehouse">Warehouse</MenuItem>
                                    <MenuItem value="School">School</MenuItem>
                                    <MenuItem value="Hospital">Hospital</MenuItem>
                                    <MenuItem value="Mall">Mall</MenuItem>
                                    <MenuItem value="Mixed-Use Tower">Mixed-Use Tower</MenuItem>
                                    {/* Premium Institutional Types */}
                                    <Divider />
                                    <MenuItem value="GOVERNMENT_MAJLIS" sx={{ fontWeight: 'bold', color: binThemeTokens.gold }}>Government Majlis ★</MenuItem>
                                    <MenuItem value="GOVERNMENT_PROPERTY" sx={{ fontWeight: 'bold', color: binThemeTokens.gold }}>Government Property ★</MenuItem>
                                    <MenuItem value="HOTEL" sx={{ fontWeight: 'bold', color: binThemeTokens.gold }}>Hotel ★</MenuItem>
                                </TextField>
                            </Grid>
                            
                            <Grid item xs={12} sm={4}>
                                <TextField fullWidth label="Owner Type" select value={activeProperty.ownerType} onChange={(e) => updateProperty(editingIndex!, { ownerType: e.target.value as any })}>
                                    <MenuItem value="Private">Private Owner</MenuItem>
                                    <MenuItem value="Government">Government Entity</MenuItem>
                                </TextField>
                            </Grid>

                            <Grid item xs={12} sm={4}>
                                <TextField fullWidth label={t('field.grade')} select value={activeProperty.assetGrade} onChange={(e) => updateProperty(editingIndex!, { assetGrade: e.target.value as any })}>
                                    <MenuItem value="Standard">{t('grade.standard')}</MenuItem>
                                    <MenuItem value="Premium">{t('grade.premium')}</MenuItem>
                                    <MenuItem value="Luxury">{t('grade.luxury')}</MenuItem>
                                    <MenuItem value="Ultra-Luxury">{t('grade.ultra')}</MenuItem>
                                    <MenuItem value="Sovereign">{t('grade.sovereign')}</MenuItem>
                                </TextField>
                            </Grid>

                            {/* Scale */}
                            <Grid item xs={12}><Divider sx={{ my: 1 }}><Chip label={t('onboarding.asset_scale')} size="small" /></Divider></Grid>
                            <Grid item xs={12} sm={3}><TextField fullWidth type="number" label="Units / Rooms" value={activeProperty.units} onChange={(e) => updateProperty(editingIndex!, { units: parseInt(e.target.value) || 0 })} /></Grid>
                            <Grid item xs={12} sm={3}><TextField fullWidth type="number" label="Floors" value={activeProperty.floors} onChange={(e) => updateProperty(editingIndex!, { floors: parseInt(e.target.value) || 0 })} /></Grid>
                            <Grid item xs={12} sm={3}><TextField fullWidth type="number" label="SqFt" value={activeProperty.sqft} onChange={(e) => updateProperty(editingIndex!, { sqft: parseInt(e.target.value) || 0 })} /></Grid>
                            <Grid item xs={12} sm={3}><TextField fullWidth type="number" label="Age" value={activeProperty.age} onChange={(e) => updateProperty(editingIndex!, { age: parseInt(e.target.value) || 0 })} /></Grid>

                            {/* GOVERNMENT_MAJLIS Fields */}
                            {activeProperty.propertyType === 'GOVERNMENT_MAJLIS' && (
                                <React.Fragment>
                                    <Grid item xs={12}><Divider sx={{ my: 1 }}><Chip label="Government Majlis Details" color="primary" size="small" /></Divider></Grid>
                                    <Grid item xs={12} sm={6}><TextField fullWidth label="Authority Name" value={activeProperty.authorityName} onChange={(e) => updateProperty(editingIndex!, { authorityName: e.target.value })} /></Grid>
                                    <Grid item xs={12} sm={3}><TextField fullWidth label="Guest Capacity" type="number" value={activeProperty.guestCapacity} onChange={(e) => updateProperty(editingIndex!, { guestCapacity: parseInt(e.target.value) || 0 })} /></Grid>
                                    <Grid item xs={12} sm={3}><TextField fullWidth label="Parking Capacity" type="number" value={activeProperty.parkingCapacity} onChange={(e) => updateProperty(editingIndex!, { parkingCapacity: parseInt(e.target.value) || 0 })} /></Grid>
                                    <Grid item xs={12} sm={4}><TextField fullWidth label="Protocol Level" select value={activeProperty.protocolLevel} onChange={(e) => updateProperty(editingIndex!, { protocolLevel: e.target.value as any })}><MenuItem value="Standard">Standard</MenuItem><MenuItem value="High">High</MenuItem><MenuItem value="Sovereign">Sovereign</MenuItem></TextField></Grid>
                                    <Grid item xs={12} sm={4}><TextField fullWidth label="Security Level" select value={activeProperty.securityLevel} onChange={(e) => updateProperty(editingIndex!, { securityLevel: e.target.value as any })}><MenuItem value="Standard">Standard</MenuItem><MenuItem value="Enhanced">Enhanced</MenuItem><MenuItem value="Maximum">Maximum</MenuItem></TextField></Grid>
                                    <Grid item xs={12} sm={4}><TextField fullWidth label="Heritage Sensitivity" select value={activeProperty.heritageSensitivity} onChange={(e) => updateProperty(editingIndex!, { heritageSensitivity: e.target.value as any })}><MenuItem value="Standard">Standard</MenuItem><MenuItem value="Cultural">Cultural</MenuItem><MenuItem value="Protected">Protected</MenuItem><MenuItem value="Sovereign">Sovereign</MenuItem></TextField></Grid>
                                    <Grid item xs={12} sm={4}><FormControlLabel control={<Checkbox checked={activeProperty.hospitalityReadiness} onChange={(e) => updateProperty(editingIndex!, { hospitalityReadiness: e.target.checked })} />} label="Hospitality Readiness" /></Grid>
                                    <Grid item xs={12} sm={4}><FormControlLabel control={<Checkbox checked={activeProperty.eventUse} onChange={(e) => updateProperty(editingIndex!, { eventUse: e.target.checked })} />} label="Event Use" /></Grid>
                                    <Grid item xs={12} sm={4}><TextField fullWidth label="Access Level" select value={activeProperty.publicAccessLevel} onChange={(e) => updateProperty(editingIndex!, { publicAccessLevel: e.target.value as any })}><MenuItem value="Private">Private</MenuItem><MenuItem value="Restricted">Restricted</MenuItem><MenuItem value="Public">Public</MenuItem></TextField></Grid>
                                </React.Fragment>
                            )}

                            {/* GOVERNMENT_PROPERTY Fields */}
                            {activeProperty.propertyType === 'GOVERNMENT_PROPERTY' && (
                                <React.Fragment>
                                    <Grid item xs={12}><Divider sx={{ my: 1 }}><Chip label="Government Property Details" color="primary" size="small" /></Divider></Grid>
                                    <Grid item xs={12} sm={6}><TextField fullWidth label="Department / Authority" value={activeProperty.departmentName} onChange={(e) => updateProperty(editingIndex!, { departmentName: e.target.value })} /></Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField fullWidth label="Property Subtype" select value={activeProperty.govPropertySubtype} onChange={(e) => updateProperty(editingIndex!, { govPropertySubtype: e.target.value as any })}>
                                            <MenuItem value="office">Office</MenuItem><MenuItem value="service_center">Service Center</MenuItem><MenuItem value="facility">Facility</MenuItem>
                                            <MenuItem value="accommodation">Accommodation</MenuItem><MenuItem value="compound">Compound</MenuItem><MenuItem value="mixed_government_building">Mixed Gov Building</MenuItem>
                                        </TextField>
                                    </Grid>
                                </React.Fragment>
                            )}

                            {/* HOTEL Fields */}
                            {activeProperty.propertyType === 'HOTEL' && (
                                <React.Fragment>
                                    <Grid item xs={12}><Divider sx={{ my: 1 }}><Chip label="Hotel / Hospitality Details" color="primary" size="small" /></Divider></Grid>
                                    <Grid item xs={12} sm={4}><TextField fullWidth label="Hotel Class" select value={activeProperty.hotelClass} onChange={(e) => updateProperty(editingIndex!, { hotelClass: e.target.value as any })}><MenuItem value="3_STAR">3 Star</MenuItem><MenuItem value="4_STAR">4 Star</MenuItem><MenuItem value="5_STAR">5 Star</MenuItem><MenuItem value="DELUXE">Deluxe</MenuItem><MenuItem value="ULTRA_LUXURY">Ultra Luxury</MenuItem></TextField></Grid>
                                    <Grid item xs={12} sm={4}><TextField fullWidth label="Key Count" type="number" value={activeProperty.roomCount} onChange={(e) => updateProperty(editingIndex!, { roomCount: parseInt(e.target.value) || 0 })} /></Grid>
                                    <Grid item xs={12} sm={4}><TextField fullWidth label="Restaurants" type="number" value={activeProperty.restaurantCount} onChange={(e) => updateProperty(editingIndex!, { restaurantCount: parseInt(e.target.value) || 0 })} /></Grid>
                                    <Grid item xs={12} sm={4}><TextField fullWidth label="Common Area Intensity" select value={activeProperty.commonAreaIntensity} onChange={(e) => updateProperty(editingIndex!, { commonAreaIntensity: e.target.value as any })}><MenuItem value="Standard">Standard</MenuItem><MenuItem value="High">High</MenuItem><MenuItem value="Intense">Intense</MenuItem></TextField></Grid>
                                    <Grid item xs={12} sm={4}><TextField fullWidth label="BOH Complexity" select value={activeProperty.backOfHouseComplexity} onChange={(e) => updateProperty(editingIndex!, { backOfHouseComplexity: e.target.value as any })}><MenuItem value="Standard">Standard</MenuItem><MenuItem value="Complex">Complex</MenuItem></TextField></Grid>
                                    <Grid item xs={12} sm={4}><FormControlLabel control={<Checkbox checked={activeProperty.spaGym} onChange={(e) => updateProperty(editingIndex!, { spaGym: e.target.checked })} />} label="Pool / Spa / Gym" /></Grid>
                                </React.Fragment>
                            )}

                            {/* Systems */}
                            <Grid item xs={12}>
                                <Typography variant="subtitle2" fontWeight="900" sx={{ mb: 2 }}>{t('onboarding.fm_systems')}</Typography>
                                <Grid container spacing={1}>
                                    {[
                                        { key: 'lifts', label: t('field.lifts'), type: 'number' },
                                        { key: 'pool', label: t('field.pool'), type: 'check' },
                                        { key: 'tank', label: t('field.tank'), type: 'check' },
                                        { key: 'sira', label: t('field.sira'), type: 'check' },
                                        { key: 'fireAlarm', label: t('field.civil_defense'), type: 'check' },
                                        { key: 'firePump', label: 'Fire Pump', type: 'check' },
                                        { key: 'gen', label: 'Generator', type: 'check' },
                                        { key: 'districtCooling', label: t('field.district_cooling'), type: 'check' },
                                        { key: 'solarIntegration', label: t('field.solar'), type: 'check' },
                                        { key: 'evReadiness', label: t('field.ev'), type: 'check' },
                                    ].map(sys => (
                                        <Grid item xs={6} sm={3} key={sys.key}>
                                            {sys.type === 'check' ? (
                                                <FormControlLabel control={<Checkbox checked={(activeProperty as any)[sys.key]} onChange={(e) => updateProperty(editingIndex!, { [sys.key]: e.target.checked })} />} label={<Typography variant="caption">{sys.label}</Typography>} />
                                            ) : (
                                                <TextField fullWidth size="small" type="number" label={sys.label} value={(activeProperty as any)[sys.key]} onChange={(e) => updateProperty(editingIndex!, { [sys.key]: parseInt(e.target.value) || 0 })} />
                                            )}
                                        </Grid>
                                    ))}
                                </Grid>
                            </Grid>
                        </Grid>
                    </Paper>
                )}
            </Grid>

            <Grid item xs={12} md={4}>
                <Stack spacing={3} sx={{ position: 'sticky', top: 100 }}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'background.paper', border: `2px solid ${binThemeTokens.gold}` }}>
                        <Typography variant="h6" fontWeight="900" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Workflow size={20} color={binThemeTokens.gold} /> {t('onboarding.portfolio_intel')}</Typography>
                        <Divider sx={{ my: 2 }} />
                        <Stack spacing={2.5}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">{t('summary.total_props')}</Typography><Typography variant="h6" fontWeight="900">{portfolioSummary?.totalProperties || 0}</Typography></Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">{t('summary.total_units')}</Typography><Typography variant="h6" fontWeight="900">{portfolioSummary?.totalUnits || 0}</Typography></Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">{t('summary.total_sqft')}</Typography><Typography variant="h6" fontWeight="900">{formatNumber(portfolioSummary?.totalSqFt)}</Typography></Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Typography variant="body2" color="text.secondary">{t('summary.tier')}</Typography><Chip label={portfolioSummary?.recommendedTier || 'Standard'} size="small" sx={{ fontWeight: 900, bgcolor: binThemeTokens.gold, color: '#000' }} /></Box>
                        </Stack>
                        <Button variant="contained" fullWidth size="large" onClick={handleProceed} endIcon={<ArrowRight style={{ transform: isRTL ? 'scaleX(-1)' : 'none' }} />} disabled={safeProperties.length === 0} sx={{ mt: 4, py: 2, fontWeight: 900, fontSize: '1.1rem' }}>{t('button.next_asset_analysis')}</Button>
                    </Paper>
                </Stack>
            </Grid>
        </Grid>
    );
};

export default PropertyIntakeStep;
