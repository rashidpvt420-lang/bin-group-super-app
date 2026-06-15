import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Grid, TextField, Checkbox, FormControlLabel, Stack, alpha, Divider, Chip } from '@mui/material';
import { FileSignature, ShieldCheck, ScrollText } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { formatAED } from '../../utils/formatters';
import { binThemeTokens } from '../../theme/binGroupTheme';

interface ContractSignatureStepProps {
    onNext: () => void;
    onBack: () => void;
}

const readable = (value: string | undefined, fallback: string) => {
    if (!value || value.includes('.')) return fallback;
    return value;
};

const modeLabel = (strategy?: string) => {
    if (strategy === 'pm_only' || strategy === 'pm' || strategy === 'rent') return 'Property Management Only / إدارة العقار فقط';
    if (strategy === 'both' || strategy === 'hybrid') return 'Maintenance + Property Management / الصيانة وإدارة العقار معاً';
    return 'Maintenance Only / الصيانة فقط';
};

const AgreementSection = ({ title, ar, children }: { title: string; ar: string; children: React.ReactNode }) => (
    <Box sx={{ mb: 2.25 }}>
        <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', textAlign: 'right', mb: 0.75 }}>{ar}</Typography>
        <Divider sx={{ mb: 1, borderColor: 'rgba(0,0,0,0.08)' }} />
        {children}
    </Box>
);

const Clause = ({ en, ar }: { en: string; ar: string }) => (
    <Box sx={{ mb: 1.25 }}>
        <Typography variant="caption" sx={{ display: 'block', color: '#111827', lineHeight: 1.7 }}>{en}</Typography>
        <Typography variant="caption" sx={{ display: 'block', color: '#6B7280', textAlign: 'right', lineHeight: 1.8 }}>{ar}</Typography>
    </Box>
);

const ListClause = ({ items }: { items: string[] }) => (
    <Stack spacing={0.4} sx={{ mt: 0.75 }}>
        {items.map((item) => (
            <Typography key={item} variant="caption" sx={{ display: 'block', color: '#111827', lineHeight: 1.65 }}>• {item}</Typography>
        ))}
    </Stack>
);

export default function ContractSignatureStep({ onNext, onBack }: ContractSignatureStepProps) {
    const { companyProfile, ownerAccount, properties, portfolioSummary, isContractSigned, signatureName, setContractSignature, calculateSummary } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const [typedName, setTypedName] = useState(signatureName || '');
    const [accepted, setAccepted] = useState(isContractSigned);
    const primaryProperty = properties[0];
    const quote = portfolioSummary.quoteResults?.[primaryProperty?.id] || Object.values(portfolioSummary.quoteResults || {})[0];
    const ownerName = ownerAccount?.fullName || companyProfile.contactPerson || 'Owner';
    const agreementVersion = 'BIN-GROUP-OWNER-AGREEMENT-v1.1-SCOPE-LOCKED';
    const propertyIdentity = `${primaryProperty?.propertyType || 'Property'} · ${primaryProperty?.assetGrade || 'Premium'} · ${primaryProperty?.emirate || 'UAE'}`;

    useEffect(() => { calculateSummary(); }, [calculateSummary, properties]);
    useEffect(() => { setContractSignature(accepted, typedName); }, [typedName, accepted, setContractSignature]);

    const isValid = typedName.trim().length >= 3 && accepted;
    const includedServices = quote?.includedServices || [];
    const excludedServices = quote?.excludedServices || [];
    const contractClauses = quote?.contractClauses || [];
    const assetSpecificScope = quote?.assetSpecificScope || [];
    const approvalRules = quote?.approvalRules || [];
    const serviceSchedule = quote?.serviceSchedule || [];
    const appliedAddOns = quote?.appliedAddOns || [];

    return (
        <Box sx={{ maxWidth: 980, mx: 'auto', width: '100%', py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 }, dir: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" color="#FFF" gutterBottom>{readable(t('onboarding.contract_title'), 'Full Bilingual Owner Service Agreement')}</Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">{readable(t('onboarding.contract_desc'), 'Review the full English/Arabic contract and provide your digital signature to proceed.')}</Typography>
            </Box>

            <Paper sx={{ p: { xs: 2, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', mb: 4 }}>
                <Box sx={{ bgcolor: '#FFF', color: '#000', p: { xs: 2.5, md: 4 }, borderRadius: 2, mb: 4, position: 'relative', overflow: 'hidden', maxHeight: 760, overflowY: 'auto' }}>
                    <Box sx={{ position: 'absolute', top: -20, right: -20, opacity: 0.05, transform: 'rotate(-15deg)' }}><ShieldCheck size={220} /></Box>
                    <Typography variant="h5" fontWeight="950" align="center" sx={{ color: binThemeTokens.gold, mb: 0.5 }}>BIN GROUP L.L.C - S.P.C</Typography>
                    <Typography variant="subtitle2" align="center" display="block" fontWeight="950">OWNER SERVICE AGREEMENT</Typography>
                    <Typography variant="caption" align="center" display="block" color="text.secondary" sx={{ mb: 2 }}>اتفاقية خدمات المالك</Typography>
                    <Typography variant="caption" align="center" display="block" color="text.secondary" sx={{ mb: 3 }}>Version: {agreementVersion}</Typography>

                    <AgreementSection title="1. Contract Cover" ar="غلاف العقد">
                        <Grid container spacing={1.25}>
                            <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Owner / المالك</Typography><Typography variant="body2" fontWeight="800">{ownerName}</Typography></Grid>
                            <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Company / الشركة</Typography><Typography variant="body2" fontWeight="800">{companyProfile.name || 'Private / فردي'}</Typography></Grid>
                            <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Property / العقار</Typography><Typography variant="body2" fontWeight="800">{primaryProperty?.address || propertyIdentity}</Typography></Grid>
                            <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Contract Mode / نوع العقد</Typography><Typography variant="body2" fontWeight="800">{modeLabel(primaryProperty?.strategy)}</Typography></Grid>
                            <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Annual Value / القيمة السنوية</Typography><Typography variant="body2" fontWeight="800" color="primary.main">AED {formatAED(quote?.annualTotal || 0)}</Typography></Grid>
                            <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Mobilization / دفعة البدء</Typography><Typography variant="body2" fontWeight="800">AED {formatAED(quote?.mobilizationFee || 0)}</Typography></Grid>
                            <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Asset Type / نوع الأصل</Typography><Typography variant="body2" fontWeight="800">{primaryProperty?.propertyType || 'N/A'}</Typography></Grid>
                            <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">GFA / المساحة الإجمالية</Typography><Typography variant="body2" fontWeight="800">{primaryProperty?.sqft ? `${primaryProperty.sqft.toLocaleString()} sq.ft` : 'N/A'}</Typography></Grid>
                            {(primaryProperty?.propertyType === 'Hotel' || primaryProperty?.propertyType === 'Resort') && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Hotel Rooms / الغرف</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.hotelProfile?.roomsCount || primaryProperty?.rooms || 'N/A'}</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Star Rating / التصنيف النجمي</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.hotelProfile?.starRating || 3}★ {(primaryProperty as any)?.hotelProfile?.hasPool ? '· Pool' : ''}{(primaryProperty as any)?.hotelProfile?.hasGym ? '· Gym' : ''}{(primaryProperty as any)?.hotelProfile?.hasRestaurant ? '· Restaurant' : ''}</Typography></Grid>
                            </>}
                            {primaryProperty?.propertyType === 'School' && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Institution / المؤسسة</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.schoolProfile?.institutionType || 'School'}</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Classrooms · Students / الفصول · الطلاب</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.schoolProfile?.classroomsCount || primaryProperty?.units || 'N/A'} classrooms · {(primaryProperty as any)?.schoolProfile?.studentCapacity || 'N/A'} students</Typography></Grid>
                            </>}
                            {(primaryProperty?.propertyType === 'Hospital' || primaryProperty?.propertyType === 'Clinic') && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Facility Type / نوع المرفق</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.hospitalProfile?.facilityType || primaryProperty?.propertyType}</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Beds · ICU / الأسرة · العناية المركزة</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.hospitalProfile?.bedsCount || (primaryProperty as any)?.beds || 'N/A'} beds · {(primaryProperty as any)?.hospitalProfile?.icuBeds || 0} ICU</Typography></Grid>
                            </>}
                            {primaryProperty?.propertyType === 'Mosque / Masjid' && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Worshipper Capacity / سعة المصلين</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.mosqueProfile?.maxWorshipperCapacity || primaryProperty?.rooms || 'N/A'}</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Wudu Areas · Ramadan Peak / الوضوء · رمضان</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.mosqueProfile?.wuduAreasCount || primaryProperty?.units || 'N/A'} wudu areas · {(primaryProperty as any)?.mosqueProfile?.ramadanPeakCapacity || 'N/A'} peak</Typography></Grid>
                            </>}
                            {primaryProperty?.propertyType && ['Stadium', 'Sports Complex', 'Event Venue'].includes(primaryProperty.propertyType) && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Seating Capacity / سعة المقاعد</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.stadiumProfile?.seatingCapacity?.toLocaleString() || 'N/A'}</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Pitches + Courts / ملاعب</Typography><Typography variant="body2" fontWeight="800">{((primaryProperty as any)?.stadiumProfile?.pitchesCount || 0) + ((primaryProperty as any)?.stadiumProfile?.courtsCount || 0)} total</Typography></Grid>
                            </>}
                            {primaryProperty?.propertyType === 'Villa' && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Bedrooms · Bathrooms / الغرف · الحمامات</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.villaProfile?.bedroomsCount || primaryProperty?.bedrooms || 'N/A'} bed · {(primaryProperty as any)?.villaProfile?.bathroomsCount || primaryProperty?.bathrooms || 'N/A'} bath</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Amenities / المرافق</Typography><Typography variant="body2" fontWeight="800">{[(primaryProperty as any)?.villaProfile?.hasPrivatePool && 'Pool', (primaryProperty as any)?.villaProfile?.hasStaffQuarters && 'Staff Qtrs', (primaryProperty as any)?.villaProfile?.hasSolarPanels && 'Solar'].filter(Boolean).join(' · ') || 'Standard'}</Typography></Grid>
                            </>}
                            {(primaryProperty?.propertyType === 'Apartment' || primaryProperty?.propertyType === 'Residential Building') && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Units · Lifts / الوحدات · المصاعد</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.residentialProfile?.unitsCount || primaryProperty?.units || 'N/A'} units · {(primaryProperty as any)?.residentialProfile?.liftsCount || primaryProperty?.lifts || 0} lifts</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Amenities / المرافق</Typography><Typography variant="body2" fontWeight="800">{[(primaryProperty as any)?.residentialProfile?.hasPool && 'Pool', (primaryProperty as any)?.residentialProfile?.hasGym && 'Gym', (primaryProperty as any)?.residentialProfile?.hasLobby && 'Lobby'].filter(Boolean).join(' · ') || 'Standard'}</Typography></Grid>
                            </>}
                            {(primaryProperty?.propertyType === 'Commercial Building' || primaryProperty?.propertyType === 'Office' || primaryProperty?.propertyType === 'Skyscraper') && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Offices · Floors / المكاتب · الطوابق</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.commercialProfile?.officesCount || primaryProperty?.offices || primaryProperty?.units || 'N/A'} offices · {primaryProperty?.floors || 'N/A'} floors</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Lifts · Meeting Rooms / مصاعد · قاعات</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.commercialProfile?.liftsCount || primaryProperty?.lifts || 0} lifts · {(primaryProperty as any)?.commercialProfile?.meetingRooms || 0} meeting rooms</Typography></Grid>
                            </>}
                            {(primaryProperty?.propertyType === 'Retail Center' || primaryProperty?.propertyType === 'Mall') && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Shops · Food Court / محلات · مطاعم</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.retailProfile?.shopsCount || primaryProperty?.shops || 'N/A'} shops · {(primaryProperty as any)?.retailProfile?.foodCourtUnits || 0} F&B</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Escalators · Lifts / سلالم · مصاعد</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.retailProfile?.escalatorsCount || 0} escalators · {(primaryProperty as any)?.retailProfile?.liftsCount || primaryProperty?.lifts || 0} lifts</Typography></Grid>
                            </>}
                            {(primaryProperty?.propertyType === 'Warehouse' || primaryProperty?.propertyType === 'Industrial Property') && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Loading Bays · Power / بوابات التحميل · الطاقة</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.warehouseProfile?.loadingBays || 'N/A'} bays · {(primaryProperty as any)?.warehouseProfile?.powerLoadKW || 'N/A'} kW</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Fire Systems / أنظمة الحريق</Typography><Typography variant="body2" fontWeight="800">{[(primaryProperty as any)?.warehouseProfile?.hasSprinklers && 'Sprinklers', (primaryProperty as any)?.warehouseProfile?.hasFirePump && 'Fire Pump'].filter(Boolean).join(' · ') || 'Standard'}</Typography></Grid>
                            </>}
                            {(primaryProperty?.propertyType === 'Labour Camp' || primaryProperty?.propertyType === 'Staff Accommodation') && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Beds · Blocks / أسرة · مبانٍ</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.labourCampProfile?.bedsCount || (primaryProperty as any)?.beds || 'N/A'} beds · {(primaryProperty as any)?.labourCampProfile?.blocksCount || 'N/A'} blocks</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Kitchens · Laundry / مطابخ · مغاسل</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.labourCampProfile?.kitchensCount || 0} kitchens · {(primaryProperty as any)?.labourCampProfile?.laundryUnitsCount || 0} laundry units</Typography></Grid>
                            </>}
                            {primaryProperty?.propertyType === 'Government Property' && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Property Type · Staff / نوع العقار · الموظفون</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.governmentProfile?.govPropertyType || 'Government'} · {(primaryProperty as any)?.governmentProfile?.staffCount || 'N/A'} staff</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Security Level / مستوى الأمن</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.governmentProfile?.securityLevel || 'Standard'}{(primaryProperty as any)?.governmentProfile?.hasVIPArea ? ' · VIP Area' : ''}</Typography></Grid>
                            </>}
                            {(primaryProperty?.propertyType === 'Government Majlis' || primaryProperty?.propertyType === 'Private Majlis') && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Majlis Type · Capacity / نوع المجلس · السعة</Typography><Typography variant="body2" fontWeight="800">{primaryProperty?.propertyType} · {(primaryProperty as any)?.majlisProfile?.guestsCapacity || 'N/A'} guests</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Rooms · Event Halls / غرف · قاعات</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.majlisProfile?.majlisRoomsCount || 1} rooms · {(primaryProperty as any)?.majlisProfile?.eventHallsCount || 0} halls</Typography></Grid>
                            </>}
                            {primaryProperty?.propertyType === 'Mixed-Use Tower' && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Residential · Commercial Floors / طوابق سكنية · تجارية</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.mixedUseProfile?.residentialFloors || 'N/A'} res · {(primaryProperty as any)?.mixedUseProfile?.commercialFloors || 'N/A'} com</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Total Units · Podium Shops / الوحدات · محلات البودية</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.mixedUseProfile?.totalUnits || primaryProperty?.units || 'N/A'} units · {(primaryProperty as any)?.mixedUseProfile?.podiumShopsCount || 0} shops</Typography></Grid>
                            </>}
                            {primaryProperty?.propertyType === 'Farm / Estate' && <>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Land · Irrigation Zones / المساحة · مناطق الري</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.farmProfile?.landAcres || 'N/A'} acres · {(primaryProperty as any)?.farmProfile?.irrigationZones || 0} irrigation zones</Typography></Grid>
                                <Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Pumps · Staff Quarters / مضخات · سكن الموظفين</Typography><Typography variant="body2" fontWeight="800">{(primaryProperty as any)?.farmProfile?.pumpsCount || 0} pumps{(primaryProperty as any)?.farmProfile?.hasStaffQuarters ? ' · Staff Quarters' : ''}</Typography></Grid>
                            </>}
                            {(primaryProperty as any)?.missions?.length > 0 && (
                                <Grid item xs={12}><Typography variant="caption" color="text.secondary">Service Missions / مهام الخدمة</Typography><Typography variant="body2" fontWeight="800">{((primaryProperty as any)?.missions || []).slice(0, 4).join(' · ')}</Typography></Grid>
                            )}
                        </Grid>
                    </AgreementSection>

                    <AgreementSection title="2. Selected Asset Schedule" ar="جدول الأصل المختار">
                        <Grid container spacing={1.25}>
                            <Grid item xs={12} md={4}><Typography variant="caption" color="text.secondary">Asset Type / نوع الأصل</Typography><Typography variant="body2" fontWeight="800">{primaryProperty?.propertyType || 'Property'}</Typography></Grid>
                            <Grid item xs={12} md={4}><Typography variant="caption" color="text.secondary">Asset Grade / درجة الأصل</Typography><Typography variant="body2" fontWeight="800">{primaryProperty?.assetGrade || 'Premium'}</Typography></Grid>
                            <Grid item xs={12} md={4}><Typography variant="caption" color="text.secondary">Area / المساحة</Typography><Typography variant="body2" fontWeight="800">{primaryProperty?.sqft || 0} sq.ft</Typography></Grid>
                            <Grid item xs={12} md={4}><Typography variant="caption" color="text.secondary">Units/Capacity / الوحدات</Typography><Typography variant="body2" fontWeight="800">{primaryProperty?.units || primaryProperty?.rooms || primaryProperty?.roomCount || 1}</Typography></Grid>
                            <Grid item xs={12} md={4}><Typography variant="caption" color="text.secondary">Age / العمر</Typography><Typography variant="body2" fontWeight="800">{primaryProperty?.age || 0} years</Typography></Grid>
                            <Grid item xs={12} md={4}><Typography variant="caption" color="text.secondary">SLA / مستوى الخدمة</Typography><Typography variant="body2" fontWeight="800">{primaryProperty?.slaTier || 'standard'}</Typography></Grid>
                        </Grid>
                        <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1.5 }}>
                            {assetSpecificScope.map((item) => <Chip key={item} size="small" label={item} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.08), color: '#111827', fontWeight: 800 }} />)}
                        </Stack>
                    </AgreementSection>

                    <AgreementSection title="3. Included Services" ar="الخدمات المشمولة">
                        <ListClause items={includedServices} />
                    </AgreementSection>

                    <AgreementSection title="4. Exclusions and Approval Rules" ar="الاستثناءات وقواعد الموافقة">
                        <ListClause items={[...excludedServices, ...approvalRules]} />
                    </AgreementSection>

                    <AgreementSection title="5. Mandatory Add-ons and Service Schedule" ar="الإضافات الإلزامية وجدول الخدمة">
                        <Grid container spacing={1}>
                            <Grid item xs={12} md={6}>
                                <Typography variant="caption" color="text.secondary">Applied Add-ons / الإضافات المطبقة</Typography>
                                <ListClause items={appliedAddOns.map((a) => `${a.label} — AED ${formatAED(a.annualValue)}`)} />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Typography variant="caption" color="text.secondary">Schedule / الجدول</Typography>
                                <ListClause items={serviceSchedule} />
                            </Grid>
                        </Grid>
                    </AgreementSection>

                    <AgreementSection title="6. Contract Mode Matrix" ar="مصفوفة نوع العقد">
                        <Clause en="Maintenance Only means BIN GROUP handles agreed maintenance services, complaints, technician dispatch, evidence, and reports only. Rent collection, lease management, tenant disputes, eviction, and financial ledgers are excluded unless separately contracted." ar="الصيانة فقط تعني أن مجموعة بن تتولى خدمات الصيانة المتفق عليها والبلاغات وتوجيه الفنيين والإثباتات والتقارير فقط. ولا تشمل تحصيل الإيجارات أو إدارة عقود الإيجار أو نزاعات المستأجرين أو الإخلاء أو الدفاتر المالية إلا باتفاق منفصل." />
                        <Clause en="Property Management Only means BIN GROUP handles property administration, occupancy visibility, tenant records, document coordination, owner reporting, and rent/ledger visibility where included. Physical repairs and contractor costs are excluded unless separately approved and paid." ar="إدارة العقار فقط تعني أن مجموعة بن تتولى الإدارة العقارية ومتابعة الإشغال وسجلات المستأجرين وتنسيق المستندات وتقارير المالك وعرض الإيجارات والدفعات متى كانت مشمولة. ولا تشمل الإصلاحات الفعلية وتكاليف المقاولين إلا بعد الموافقة والسداد بشكل منفصل." />
                        <Clause en="Maintenance + Property Management means both operational maintenance and property management are provided according to the approved package, service schedule, SLA tier, exclusions, and payment plan." ar="الصيانة وإدارة العقار معاً تعني تقديم الصيانة التشغيلية وإدارة العقار وفقاً للباقة المعتمدة وجدول الخدمات ومستوى الخدمة والاستثناءات وخطة السداد." />
                    </AgreementSection>

                    <AgreementSection title="7. Institutional / Non-Tenant Properties" ar="العقارات المؤسسية وغير القائمة على المستأجرين">
                        <Clause en="For Majlis, government buildings, hospitals, schools, universities, malls, hotels, staff accommodation, community facilities, mosques, warehouses, industrial sites, stadiums and similar properties, the system may use Authorized Reporters instead of tenant leases. Reporters can submit complaints, photos, incidents, observations, and requests, but they do not receive tenancy, ownership, employment, payment, or agency rights." ar="بالنسبة للمجالس والمباني الحكومية والمستشفيات والمدارس والجامعات والمراكز التجارية والفنادق وسكن الموظفين والمرافق المجتمعية والمساجد والمستودعات والمواقع الصناعية والملاعب وما يماثلها، يجوز للنظام استخدام مبلغين معتمدين بدلاً من عقود المستأجرين. يمكن للمبلغين تقديم البلاغات والصور والحوادث والملاحظات والطلبات، ولا يكتسبون حقوق إيجار أو ملكية أو عمل أو دفع أو وكالة." />
                    </AgreementSection>

                    <AgreementSection title="8. Scope, Owner Duties, Payment" ar="النطاق والتزامات المالك والدفع">
                        <Clause en="BIN GROUP provides only services expressly listed in the selected package, approved quotation, digital contract, service schedule, or written addendum. Additional works, emergency works, materials, parts, government fees, approvals, inspections, legal work, fit-out, design, civil works, MEP upgrades, and out-of-scope requests require prior written approval and additional payment." ar="تقدم مجموعة بن فقط الخدمات المذكورة صراحةً في الباقة المختارة أو عرض السعر المعتمد أو العقد الرقمي أو جدول الخدمات أو الملحق الخطي. وتتطلب الأعمال الإضافية أو الطارئة أو المواد أو قطع الغيار أو الرسوم الحكومية أو الموافقات أو الفحوصات أو الأعمال القانونية أو التشطيب أو التصميم أو الأعمال المدنية أو ترقيات الأعمال الكهروميكانيكية أو الطلبات خارج النطاق موافقة خطية مسبقة وسداداً إضافياً." />
                        <Clause en="The Owner must provide accurate title deed, property, tenant, occupancy, access, and payment information; provide safe access; pay fees, VAT, third-party costs, emergency costs, and approved variations; obtain required consents; and ensure tenants, residents, guards, delegates, and reporters follow platform rules." ar="يلتزم المالك بتقديم معلومات دقيقة عن سند الملكية والعقار والمستأجرين والإشغال والدخول والدفع؛ وتوفير دخول آمن؛ وسداد الرسوم وضريبة القيمة المضافة وتكاليف الأطراف الثالثة والتكاليف الطارئة والتغييرات المعتمدة؛ والحصول على الموافقات المطلوبة؛ وضمان التزام المستأجرين والمقيمين والحراس والمندوبين والمبلغين بقواعد المنصة." />
                    </AgreementSection>

                    <AgreementSection title="9. Locked Quote Clauses" ar="بنود عرض السعر المثبتة">
                        <ListClause items={contractClauses} />
                    </AgreementSection>

                    <AgreementSection title="10. Legal Protection Clauses" ar="بنود الحماية القانونية">
                        <Clause en="BIN GROUP is not responsible for hidden defects, pre-existing defects, structural/design defects, defective materials, illegal modifications, authority violations, tenant/rent disputes, eviction, bounced cheques, loss of rent, loss of profit, business interruption, indirect loss, reputational damage, force majeure, misuse, negligence, unauthorized repairs, or third-party acts unless liability cannot be excluded under UAE law." ar="لا تكون مجموعة بن مسؤولة عن العيوب المخفية أو السابقة أو الإنشائية أو التصميمية أو المواد المعيبة أو التعديلات غير القانونية أو مخالفات الجهات أو نزاعات المستأجرين أو الإيجار أو الإخلاء أو الشيكات المرتجعة أو فقدان الإيجار أو خسارة الأرباح أو توقف الأعمال أو الخسائر غير المباشرة أو ضرر السمعة أو القوة القاهرة أو سوء الاستخدام أو الإهمال أو الإصلاحات غير المصرح بها أو تصرفات الأطراف الثالثة إلا إذا كانت المسؤولية لا يجوز استبعادها بموجب قانون دولة الإمارات." />
                        <Clause en="To the maximum extent permitted by UAE law, BIN GROUP total liability shall not exceed fees actually paid by the Owner during the preceding twelve months for the specific service giving rise to the claim. The Owner indemnifies BIN GROUP for inaccurate information, lack of authority, unsafe conditions, misuse, unpaid charges, unlawful instructions, third-party acts, or Owner breach." ar="إلى الحد الأقصى المسموح به بموجب قانون دولة الإمارات، لا تتجاوز مسؤولية مجموعة بن الإجمالية الرسوم التي دفعها المالك فعلياً خلال الاثني عشر شهراً السابقة عن الخدمة المحددة التي نشأ عنها الادعاء. ويلتزم المالك بتعويض مجموعة بن عن المعلومات غير الدقيقة أو عدم وجود الصلاحية أو الظروف غير الآمنة أو إساءة الاستخدام أو الرسوم غير المسددة أو التعليمات غير القانونية أو تصرفات الأطراف الثالثة أو إخلال المالك." />
                    </AgreementSection>

                    <AgreementSection title="11. Digital Evidence, AI Disclaimer, Law" ar="الإثبات الرقمي وإخلاء مسؤولية الذكاء الاصطناعي والقانون">
                        <Clause en="BIN GROUP may generate, store, timestamp, hash, and retain contracts, quotations, invoices, property passports, tickets, photos, approvals, signatures, GPS logs, audit logs, and service evidence in its Document Vault. AI recommendations, pricing suggestions, classifications, risk scores, and dashboard insights are decision-support only and do not replace legal, engineering, tax, accounting, insurance, valuation, or authority advice." ar="يجوز لمجموعة بن إنشاء وتخزين وختم وحفظ العقود وعروض الأسعار والفواتير وجوازات العقار والتذاكر والصور والموافقات والتوقيعات وسجلات الموقع وسجلات التدقيق وإثباتات الخدمة في خزنة المستندات. وتُعد توصيات الذكاء الاصطناعي واقتراحات الأسعار والتصنيفات ودرجات المخاطر ومؤشرات لوحات التحكم أدوات مساعدة لاتخاذ القرار فقط ولا تغني عن الاستشارة القانونية أو الهندسية أو الضريبية أو المحاسبية أو التأمينية أو التقييمية أو موافقات الجهات." />
                        <Clause en="This Agreement is governed by UAE law as applicable in Abu Dhabi. Abu Dhabi Courts have jurisdiction subject to mandatory law. The Agreement is English/Arabic; in case of conflict before UAE mainland courts, Arabic prevails unless a signed addendum says otherwise." ar="تخضع هذه الاتفاقية لقوانين دولة الإمارات كما هي مطبقة في أبوظبي. وتختص محاكم أبوظبي مع مراعاة القوانين الإلزامية. أُعدت الاتفاقية بالإنجليزية والعربية؛ وفي حال التعارض أمام محاكم دولة الإمارات البرية يسود النص العربي ما لم ينص ملحق موقع على خلاف ذلك." />
                    </AgreementSection>
                </Box>

                <Box sx={{ p: 3, bgcolor: 'rgba(198, 167, 94, 0.05)', borderRadius: 2, border: `1px solid rgba(198, 167, 94, 0.2)` }}>
                    <Stack direction="row" spacing={1} alignItems="center" mb={2}><FileSignature size={20} color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" color="#FFF">Digital Signature</Typography></Stack>
                    <TextField fullWidth label="Type your full legal name to sign" variant="outlined" value={typedName} onChange={(e) => setTypedName(e.target.value)} sx={{ mb: 2 }} InputProps={{ sx: { color: '#FFF', fontFamily: 'monospace', fontSize: '1.1rem' } }} />
                    <FormControlLabel control={<Checkbox checked={accepted} onChange={(e) => setAccepted(e.target.checked)} sx={{ color: binThemeTokens.gold, '&.Mui-checked': { color: binThemeTokens.gold } }} />} label={<Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>I, <strong>{typedName || '___'}</strong>, accept the full bilingual Owner Service Agreement, selected asset schedule, included services, exclusions, approval rules, limitation of liability, indemnity, digital evidence vault, and UAE governing law clauses, and authorize BIN GROUP to generate the locked signed PDF.</Typography>} />
                </Box>
            </Paper>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button variant="outlined" onClick={onBack} fullWidth sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', py: 1.5, px: 4, borderRadius: 100, fontWeight: 950 }}>{readable(t('onboarding.back'), 'Back')}</Button>
                <Button variant="contained" onClick={onNext} disabled={!isValid} fullWidth sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, px: 4, borderRadius: 100, '&:hover': { bgcolor: '#FFF' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' } }}><ScrollText size={18} style={{ marginRight: 8 }} />{readable(t('onboarding.sign_proceed'), 'Sign Full Agreement & Proceed to Payment')}</Button>
            </Stack>
        </Box>
    );
}
