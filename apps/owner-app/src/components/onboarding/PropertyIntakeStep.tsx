import React, { useState, useEffect, useRef } from 'react';
import { 
    Box, 
    Typography, 
    Grid, 
    TextField, 
    MenuItem, 
    FormControl, 
    InputLabel, 
    Select, 
    Paper, 
    Divider,
    Stack,
    Button,
    Chip,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    alpha,
    Checkbox,
    FormControlLabel,
    Tabs,
    Tab,
    Alert,
    styled
} from '@mui/material';
import { 
    Building2, 
    Plus,
    Trash2,
    FileSpreadsheet,
    ArrowRight,
    MapPin,
    AlertCircle,
    Info,
    ShieldAlert,
    Landmark,
    Gem,
    Workflow
} from 'lucide-react';
import { useOnboardingStore, PropertyData } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { db, collection, addDoc, serverTimestamp } from '../../lib/firebase';
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
        properties, 
        addProperty, 
        removeProperty, 
        updateProperty, 
        calculateSummary, 
        portfolioSummary, 
        bulkAddProperties,
        intakeId,
        setIntakeId,
        companyProfile
    } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const [editingIndex, setEditingIndex] = useState<number | null>(0);
    const [tabValue, setTabValue] = useState(0); // 0: Manual, 1: Bulk CSV
    const autocompleteRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Requirement: Submit to Vault when moving to analysis
    const handleProceed = async () => {
        if (properties.length === 0) return;

        try {
            // Only create a new submission if one doesn't exist for this session
            if (!intakeId) {
                const docRef = await addDoc(collection(db, 'intake_submissions'), {
                    properties,
                    portfolioSummary,
                    contactInfo: companyProfile,
                    status: 'PENDING',
                    createdAt: serverTimestamp(),
                    source: 'frontend_wizard_v1.15'
                });
                setIntakeId(docRef.id);
                console.log(`[VAULT] Entry secured: ${docRef.id}`);
            }
            onNext();
        } catch (error) {
            console.error("[VAULT-BREACH] Submission failed:", error);
            // Even if vault write fails, we proceed to analysis for UX, 
            // but log the critical failure.
            onNext();
        }
    };

    const handleAddProperty = () => {
        if (properties.length >= 500) return;
        addProperty();
        setEditingIndex(properties.length); // Edit the newly added one
    };

    const handleFileSelect = () => {
        fileInputRef.current?.click();
    };

    const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const parsedData = results.data as any[];
                if (parsedData.length === 0) return;

                const newProps: PropertyData[] = parsedData.slice(0, 500).map((row, i) => ({
                    id: `bulk-${i}-${Date.now()}`,
                    emirate: row.Emirate || 'Dubai',
                    area: row.Area || '',
                    propertyType: row.PropertyType || 'Residential',
                    subType: row.SubType || 'Apartment',
                    useType: (row.UseType || 'Rental') as any,
                    floors: parseInt(row.Floors) || 1,
                    units: parseInt(row.Units) || 1,
                    bedrooms: parseInt(row.Bedrooms) || 1,
                    bathrooms: parseInt(row.Bathrooms) || 1,
                    sqft: parseInt(row.SqFt) || 1200,
                    age: parseInt(row.Age) || 5,
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
                    bmu: false,
                    firePump: false,
                    escalators: false,
                    centralLPG: false,
                    wasteMan: false,
                    gen: false,
                    hvac: false,
                    districtCooling: false,
                    majlisSubtype: '',
                    majlisGarden: false,
                    heritageSensitivity: 'Standard',
                    guestCapacity: 0,
                    parkingCapacity: 0,
                    hospitalityReadiness: false,
                    irrigationSystem: false,
                    solarIntegration: false,
                    evReadiness: false,
                    securityLevel: 'Standard',
                    protocolLevel: 'Standard',
                    publicGathering: false,
                    governmentUse: false,
                    eventUse: false,
                }));

                bulkAddProperties(newProps);
                setTabValue(0);
                setEditingIndex(0);
            },
            error: (error) => {
                console.error("CSV Parse Error:", error);
            }
        });
    };

    const activeProperty = editingIndex !== null ? properties[editingIndex] : null;

    useEffect(() => {
        if (typeof (window as any).google !== 'undefined' && autocompleteRef.current && activeProperty) {
            const autocomplete = new (window as any).google.maps.places.Autocomplete(autocompleteRef.current, {
                componentRestrictions: { country: 'ae' },
                fields: ['address_components', 'geometry', 'formatted_address'],
            });

            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (place.formatted_address && editingIndex !== null) {
                    let city = 'Dubai';
                    let areaVal = '';
                    
                    place.address_components.forEach((comp: any) => {
                        if (comp.types.includes('locality') || comp.types.includes('administrative_area_level_1')) city = comp.long_name;
                        if (comp.types.includes('neighborhood') || comp.types.includes('sublocality')) areaVal = comp.long_name;
                    });

                    updateProperty(editingIndex, { 
                        address: place.formatted_address,
                        emirate: city,
                        area: areaVal || place.formatted_address.split(',')[0]
                    });
                }
            });
        }
    }, [editingIndex, updateProperty]);

    return (
        <Grid container spacing={4} sx={{ mt: 2 }}>
            <Grid item xs={12} md={8}>
                <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <Box>
                        <Typography variant="h3" fontWeight="900" sx={{ mb: 1, textTransform: 'uppercase' }}>
                            {t('onboarding.bulk_intake')}
                        </Typography>
                        <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, fontWeight: 400 }}>
                            {t('intake.identification')}
                        </Typography>
                    </Box>
                    <Chip 
                        icon={<Building2 size={16} />} 
                        label={`${properties.length} / 500 ${t('common.assets')}`} 
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 2, py: 2.5, borderRadius: 2 }} 
                    />
                </Box>

                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 3 }}>
                    <Tab label={t('button.manual_entry')} icon={<Plus size={18} />} iconPosition="start" />
                    <Tab label={t('button.bulk_csv')} icon={<FileSpreadsheet size={18} />} iconPosition="start" />
                </Tabs>

                {tabValue === 1 ? (
                    <Box sx={{ p: 4, textAlign: 'center', border: '2px dashed rgba(198,167,94,0.3)', borderRadius: 4, bgcolor: 'rgba(198,167,94,0.02)' }}>
                        <VisuallyHiddenInput
                            accept=".csv"
                            ref={fileInputRef}
                            id="portfolio-csv-upload"
                            title="Upload Portfolio CSV"
                            onChange={handleCsvUpload}
                        />
                        <Typography variant="h5" fontWeight="900" gutterBottom>{t('button.bulk_csv')}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{t('onboarding.csv_helper')}</Typography>
                        <Button variant="contained" onClick={handleFileSelect} startIcon={<FileSpreadsheet />}>{t('button.select_csv')}</Button>
                    </Box>
                ) : (
                    <Paper sx={{ p: 3, borderRadius: 4, mb: 4, bgcolor: 'background.paper', border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                        <TableContainer sx={{ maxHeight: 400 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.2)', fontWeight: 900 }}>{t('field.property')}</TableCell>
                                        <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.2)', fontWeight: 900 }}>{t('field.type')}</TableCell>
                                        <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.2)', fontWeight: 900 }}>{t('field.units')}</TableCell>
                                        <TableCell sx={{ bgcolor: 'rgba(0,0,0,0.2)', fontWeight: 900 }}>{t('field.usage')}</TableCell>
                                        <TableCell align="right" sx={{ bgcolor: 'rgba(0,0,0,0.2)', fontWeight: 900 }}>{t('common.action')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {properties.map((prop, index) => (
                                        <TableRow 
                                            key={index} 
                                            hover 
                                            onClick={() => setEditingIndex(index)}
                                            sx={{ cursor: 'pointer', bgcolor: editingIndex === index ? alpha(binThemeTokens.gold, 0.1) : 'transparent' }}
                                        >
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="900">
                                                    {prop.address || `${t('common.asset')} #${index + 1}`}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">{prop.area}, {prop.emirate}</Typography>
                                            </TableCell>
                                            <TableCell><Chip label={prop.subType} size="small" variant="outlined" /></TableCell>
                                            <TableCell><Typography variant="body2" fontWeight="700">{prop.units}</Typography></TableCell>
                                            <TableCell><Chip label={prop.useType} size="small" color={prop.useType === 'Rental' ? 'success' : 'primary'} /></TableCell>
                                            <TableCell align="right">
                                                <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); removeProperty(index); if (editingIndex === index) setEditingIndex(null); }}>
                                                    <Trash2 size={16} />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <Button fullWidth variant="outlined" sx={{ mt: 2, borderStyle: 'dashed' }} onClick={handleAddProperty} startIcon={<Plus />}>
                            {t('button.add_property')}
                        </Button>
                    </Paper>
                )}

                {activeProperty && (
                    <Paper sx={{ p: 4, borderRadius: 4, border: `1px solid ${binThemeTokens.gold}` }}>
                        <Typography variant="h5" fontWeight="900" sx={{ mb: 4, borderLeft: `4px solid ${binThemeTokens.gold}`, pl: 2 }}>
                            {t('onboarding.asset_details')}: {activeProperty.address || `${t('common.asset')} #${(editingIndex || 0) + 1}`}
                        </Typography>

                        <Grid container spacing={3}>
                            {/* 1. Classification */}
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label={t('field.emirate')} select value={activeProperty.emirate} onChange={(e) => updateProperty(editingIndex!, { emirate: e.target.value })}>
                                    {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'RAK', 'Fujairah', 'UAQ'].map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
                                </TextField>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label={t('field.area')} value={activeProperty.area} onChange={(e) => updateProperty(editingIndex!, { area: e.target.value })} />
                            </Grid>

                            <Grid item xs={12} sm={4}>
                                <TextField fullWidth label={t('field.type')} select value={activeProperty.propertyType} onChange={(e) => updateProperty(editingIndex!, { propertyType: e.target.value })}>
                                    <MenuItem value="Residential">{t('type.residential')}</MenuItem>
                                    <MenuItem value="Commercial">{t('type.commercial')}</MenuItem>
                                    <MenuItem value="Mixed-Use">{t('type.mixed')}</MenuItem>
                                    <MenuItem value="Institutional">{t('type.institutional')}</MenuItem>
                                    <MenuItem value="Majlis">{t('type.majlis')}</MenuItem>
                                </TextField>
                            </Grid>
                            
                            <Grid item xs={12} sm={4}>
                                <TextField fullWidth label={t('field.usetype')} select value={activeProperty.useType} onChange={(e) => updateProperty(editingIndex!, { useType: e.target.value as any })}>
                                    <MenuItem value="Rental">{t('property.rental')}</MenuItem>
                                    <MenuItem value="Personal">{t('property.personal')}</MenuItem>
                                    <MenuItem value="Mixed">{t('property.mixed')}</MenuItem>
                                    <MenuItem value="Government">{t('property.gov')}</MenuItem>
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

                            {/* 2. Scale & Mixed Use Logic */}
                            <Grid item xs={12}>
                                <Divider sx={{ my: 1 }}><Chip label={t('onboarding.asset_scale')} size="small" /></Divider>
                            </Grid>

                            <Grid item xs={12} sm={3}>
                                <TextField fullWidth type="number" label="Units / Rooms" value={activeProperty.units} onChange={(e) => updateProperty(editingIndex!, { units: parseInt(e.target.value) || 0 })} />
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <TextField fullWidth type="number" label="Floors" value={activeProperty.floors} onChange={(e) => updateProperty(editingIndex!, { floors: parseInt(e.target.value) || 0 })} />
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <TextField fullWidth type="number" label="SqFt" value={activeProperty.sqft} onChange={(e) => updateProperty(editingIndex!, { sqft: parseInt(e.target.value) || 0 })} />
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <TextField fullWidth type="number" label="Age" value={activeProperty.age} onChange={(e) => updateProperty(editingIndex!, { age: parseInt(e.target.value) || 0 })} />
                            </Grid>

                            {/* Mixed Use Fields - Auto Analysis Trigger */}
                            {(activeProperty.propertyType === 'Mixed-Use' || activeProperty.useType === 'Mixed') && (
                                <React.Fragment>
                                    <Grid item xs={12} sm={4}>
                                        <TextField fullWidth type="number" label={t('field.shops')} value={activeProperty.shops} onChange={(e) => updateProperty(editingIndex!, { shops: parseInt(e.target.value) || 0 })} />
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <TextField fullWidth type="number" label={t('field.offices')} value={activeProperty.offices} onChange={(e) => updateProperty(editingIndex!, { offices: parseInt(e.target.value) || 0 })} />
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <TextField fullWidth type="number" label={t('field.serviced_rooms')} value={activeProperty.rooms} onChange={(e) => updateProperty(editingIndex!, { rooms: parseInt(e.target.value) || 0 })} />
                                    </Grid>
                                </React.Fragment>
                            )}

                            {/* Majlis Specifics */}
                            {activeProperty.propertyType === 'Majlis' && (
                                <React.Fragment>
                                    <Grid item xs={12}>
                                         <Divider sx={{ my: 1 }}><Chip label={t('onboarding.majlis_profile')} color="primary" size="small" /></Divider>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField fullWidth label="Majlis Profile" select value={activeProperty.majlisType} onChange={(e) => updateProperty(editingIndex!, { majlisType: e.target.value as any })}>
                                            <MenuItem value="private">{t('majlis.private')}</MenuItem>
                                            <MenuItem value="royal">{t('majlis.royal')}</MenuItem>
                                            <MenuItem value="government">{t('majlis.government')}</MenuItem>
                                            <MenuItem value="sovereign">{t('majlis.sovereign')}</MenuItem>
                                        </TextField>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField fullWidth label="Guest Capacity (Majlis)" type="number" value={activeProperty.guestCapacity} onChange={(e) => updateProperty(editingIndex!, { guestCapacity: parseInt(e.target.value) || 0 })} />
                                    </Grid>
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
                                        { key: 'districtCooling', label: t('field.district_cooling'), type: 'check' },
                                        { key: 'solarIntegration', label: t('field.solar'), type: 'check' },
                                        { key: 'evReadiness', label: t('field.ev'), type: 'check' },
                                    ].map(sys => (
                                        <Grid item xs={6} sm={3} key={sys.key}>
                                            {sys.type === 'check' ? (
                                                <FormControlLabel
                                                    control={<Checkbox checked={(activeProperty as any)[sys.key]} onChange={(e) => updateProperty(editingIndex!, { [sys.key]: e.target.checked })} />}
                                                    label={<Typography variant="caption">{sys.label}</Typography>}
                                                />
                                            ) : (
                                                <TextField 
                                                    fullWidth size="small" type="number" 
                                                    label={sys.label} 
                                                    value={(activeProperty as any)[sys.key]} 
                                                    onChange={(e) => updateProperty(editingIndex!, { [sys.key]: parseInt(e.target.value) || 0 })} 
                                                />
                                            )}
                                        </Grid>
                                    ))}
                                </Grid>
                            </Grid>
                        </Grid>
                    </Paper>
                )}
            </Grid>

            {/* Right Side: Portfolio Summary & Dashboard Intelligence */}
            <Grid item xs={12} md={4}>
                <Stack spacing={3} sx={{ position: 'sticky', top: 100 }}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'background.paper', border: `2px solid ${binThemeTokens.gold}` }}>
                        <Typography variant="h6" fontWeight="900" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Workflow size={20} color={binThemeTokens.gold} /> {t('onboarding.portfolio_intel')}
                        </Typography>
                        <Divider sx={{ my: 2 }} />
                        
                        <Stack spacing={2.5}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="text.secondary">{t('summary.total_props')}</Typography>
                                <Typography variant="h6" fontWeight="900">{portfolioSummary.totalProperties}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="text.secondary">{t('summary.total_units')}</Typography>
                                <Typography variant="h6" fontWeight="900">{portfolioSummary.totalUnits}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" color="text.secondary">{t('summary.total_sqft')}</Typography>
                                <Typography variant="h6" fontWeight="900">{portfolioSummary.totalSqFt.toLocaleString()}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="body2" color="text.secondary">{t('summary.tier')}</Typography>
                                <Chip label={portfolioSummary.recommendedTier} size="small" sx={{ fontWeight: 900, bgcolor: binThemeTokens.gold, color: '#000' }} />
                            </Box>
                        </Stack>

                        {portfolioSummary.isMixedUsePortfolio && (
                            <Alert icon={<Gem size={20} />} severity="info" sx={{ mt: 3, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${binThemeTokens.gold}`, color: '#fff' }}>
                                <Typography variant="caption" fontWeight="900">{t('onboarding.mixed_use_alert')}</Typography>
                                <Typography variant="body2" sx={{ fontSize: '0.7rem', display: 'block' }}>{t('onboarding.mixed_use_helper')}</Typography>
                            </Alert>
                        )}

                        {portfolioSummary.isSovereignPortfolio && (
                            <Alert icon={<Landmark size={20} />} severity="warning" sx={{ mt: 2, bgcolor: 'rgba(255,255,255,0.05)', border: `1px solid ${binThemeTokens.gold}`, color: binThemeTokens.gold }}>
                                <Typography variant="caption" fontWeight="900">{t('onboarding.sovereign_protocol')}</Typography>
                                <Typography variant="body2" sx={{ fontSize: '0.7rem', display: 'block' }}>{t('onboarding.sovereign_helper')}</Typography>
                            </Alert>
                        )}

                        <Button 
                            variant="contained" 
                            fullWidth 
                            size="large"
                            onClick={handleProceed}
                            endIcon={<ArrowRight style={{ transform: isRTL ? 'scaleX(-1)' : 'none' }} />}
                            disabled={properties.length === 0}
                            sx={{ mt: 4, py: 2, fontWeight: 900, fontSize: '1.1rem' }}
                        >
                            {t('button.next_asset_analysis')}
                        </Button>
                    </Paper>

                     <Paper sx={{ p: 3, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), display: { xs: 'none', md: 'block' } }}>
                        <Typography variant="caption" fontWeight="900" color="primary" sx={{ letterSpacing: 1 }}>{t('onboarding.audit_log')}</Typography>
                        <Stack spacing={1} sx={{ mt: 2 }}>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Info size={14} />
                                <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>{t('onboarding.verifying_assets', { count: portfolioSummary.totalUnits })}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <ShieldAlert size={14} color={binThemeTokens.gold} />
                                <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>{t('onboarding.normalization_active', { tier: portfolioSummary.recommendedTier })}</Typography>
                            </Box>
                        </Stack>
                    </Paper>
                </Stack>
            </Grid>
        </Grid>
    );
};

export default PropertyIntakeStep;
