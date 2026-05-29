const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = (rel) => path.join(root, rel);
const read = (rel) => fs.readFileSync(file(rel), 'utf8');
const write = (rel, text) => {
  fs.writeFileSync(file(rel), text);
  console.log(`patched ${rel}`);
};

function must(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Missing required pattern: ${label}`);
  return text.replace(before, after);
}

function maybe(text, before, after, label) {
  if (!text.includes(before)) {
    console.warn(`skip ${label}: already patched or pattern not found`);
    return text;
  }
  return text.replace(before, after);
}

function patchProtectedRoute() {
  const rel = 'src/components/ProtectedRoute.tsx';
  let text = read(rel);
  text = maybe(text,
`interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[];
    requiredPermission?: SovereignPermission;
}`,
`interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[];
    requiredPermission?: SovereignPermission;
    /** Keep admin override for admin pages, but allow sensitive role routes to disable it. */
    allowAdminBypass?: boolean;
}`,
'ProtectedRoute props');
  text = maybe(text,
`const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requiredPermission }) => {`,
`const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, requiredPermission, allowAdminBypass = true }) => {`,
'ProtectedRoute prop default');
  text = maybe(text,
`if (allowedRoles && !allowedRoles.includes(normalizedRole) && !isAdmin) {`,
`if (allowedRoles && !allowedRoles.includes(normalizedRole) && !(allowAdminBypass && isAdmin)) {`,
'ProtectedRoute role guard');
  write(rel, text);
}

function patchAppShell() {
  const rel = 'src/App.tsx';
  let text = read(rel);
  text = text.replace(/const PUBLIC_ROUTE_PATHS = new Set\(\[[\s\S]*?\]\);/, `const PUBLIC_ROUTE_PATHS = new Set([
  '/', '/owner-landing', '/v1', '/login', '/terms-of-service', '/privacy-policy', '/terms', '/privacy', '/support',
  '/owners', '/tenants', '/technicians', '/brokers', '/property-management', '/maintenance',
  '/majlis-care', '/stadiums', '/hotels', '/malls', '/hospitals', '/government-properties', '/security', '/contact',
  '/services', '/request-demo', '/tenant-invite', '/company',
]);`);
  text = maybe(text,
`const PUBLIC_ROUTE_PREFIXES = ['/onboarding', '/verify', '/invoices'];`,
`const PUBLIC_ROUTE_PREFIXES = ['/onboarding', '/verify', '/invoices'];

const MARKETING_SELF_NAV_ROUTES = new Set([
  '/', '/owners', '/tenants', '/technicians', '/brokers', '/property-management', '/maintenance',
  '/majlis-care', '/stadiums', '/hotels', '/malls', '/hospitals', '/government-properties', '/security',
  '/services', '/contact', '/request-demo', '/company'
]);

const OWNER_TENANT_AI_ROLES = new Set(['owner', 'tenant']);`,
'App public constants');
  text = maybe(text,
`const isAdminRoute = location.pathname.startsWith('/admin');`,
`const isAdminRoute = location.pathname.startsWith('/admin');
  const normalizedRole = (role || '').toLowerCase();
  const canUseOwnerTenantAI = Boolean(user) && OWNER_TENANT_AI_ROLES.has(normalizedRole);`,
'App role AI gate');
  text = maybe(text,
`        <Route path="/ai-design-studio" element={<PublicMarketingPage page="ai-design-studio" />} />`,
`        <Route path="/ai-design-studio" element={<ProtectedRoute allowedRoles={['owner', 'tenant']} allowAdminBypass={false}><DesignStudioPage /></ProtectedRoute>} />`,
'protect ai-design-studio');
  text = maybe(text,
`        <Route path="/design-studio" element={<ProtectedRoute allowedRoles={['owner', 'tenant', 'broker', 'admin', 'ceo']}><DesignStudioPage /></ProtectedRoute>} />`,
`        <Route path="/design-studio" element={<ProtectedRoute allowedRoles={['owner', 'tenant']} allowAdminBypass={false}><DesignStudioPage /></ProtectedRoute>} />`,
'restrict design-studio');
  text = maybe(text,
`        <Route path="/design-studio/request/:id" element={<ProtectedRoute allowedRoles={['owner', 'tenant', 'broker', 'admin', 'ceo']}><DesignRequestDetailPage /></ProtectedRoute>} />`,
`        <Route path="/design-studio/request/:id" element={<ProtectedRoute allowedRoles={['owner', 'tenant']} allowAdminBypass={false}><DesignRequestDetailPage /></ProtectedRoute>} />`,
'restrict design-studio detail');
  text = maybe(text,
`      {!location.pathname.startsWith('/onboarding') && !isAdminRoute && (
        <SovereignAIChat role={(role || 'unknown').toLowerCase() as any} onNavigate={navigate} />
      )}`,
`      {canUseOwnerTenantAI && !location.pathname.startsWith('/onboarding') && !isAdminRoute && (
        <SovereignAIChat role={normalizedRole as any} onNavigate={navigate} />
      )}`,
'owner tenant AI chat only');
  text = maybe(text,
`                  <Route path="/" element={null} />`,
`                  <Route path="/" element={null} />
                  {Array.from(MARKETING_SELF_NAV_ROUTES).map((path) => (
                    <Route key={path} path={path} element={null} />
                  ))}`,
'hide global header on public marketing pages');
  write(rel, text);
}

function patchHeader() {
  const rel = 'src/components/SovereignHeader.tsx';
  let text = read(rel);
  text = maybe(text,
`    const isCompanyRoute = location.pathname === '/' || location.pathname === '/company';`,
`    const isCompanyRoute = location.pathname === '/' || location.pathname === '/company';
    const canAccessAIStudio = ['owner', 'tenant'].includes((role || '').toLowerCase());`,
'header role AI flag');
  text = maybe(text,
`                                <Button onClick={() => navigate('/ai-design-studio')} sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                    AI Studio
                                </Button>
`,
``,
'remove public AI studio link');
  text = maybe(text,
`                                <Button onClick={() => navigate('/design-studio')} sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                    {t('nav.ai_studio')}
                                </Button>`,
`                                {canAccessAIStudio && (
                                    <Button onClick={() => navigate('/design-studio')} sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                        {t('nav.ai_studio')}
                                    </Button>
                                )}`,
'gate logged-in AI studio link');
  write(rel, text);
}

function patchNavigationControl() {
  const rel = 'src/components/navigation/NavigationControl.tsx';
  let text = read(rel);
  text = maybe(text,
`    return user && ['owner', 'tenant', 'broker', 'admin', 'ceo'].includes(r);`,
`    return Boolean(user) && ['owner', 'tenant'].includes(r);`,
'floating AI roles');
  text = maybe(text,
`    if (canAccessAIStudio()) return '/design-studio';
    return '/ai-design-studio';`,
`    return '/design-studio';`,
'floating AI route');
  text = maybe(text,
`  // Never render on admin routes — admin shell has its own sidebar navigation
  if (location.pathname.startsWith('/admin')) return null;
  if (['/', '/login', '/gateway'].includes(location.pathname) || location.pathname.startsWith('/onboarding')) return null;`,
`  // Never render on public/anonymous routes or admin routes. Role portals own this control.
  if (!user) return null;
  if (location.pathname.startsWith('/admin')) return null;
  if (['/', '/login', '/gateway', '/company'].includes(location.pathname) || location.pathname.startsWith('/onboarding')) return null;`,
'hide floating controls on public pages');
  text = maybe(text,
`        <Tooltip title={t('nav.ai_studio') || 'AI Studio'} placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate(getAIStudioRoute())} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important` }}><Paintbrush size={20} /></IconButton></Tooltip>`,
`        {canAccessAIStudio() && <Tooltip title={t('nav.ai_studio') || 'AI Studio'} placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate(getAIStudioRoute())} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important` }}><Paintbrush size={20} /></IconButton></Tooltip>}`,
'render AI floating button only when allowed');
  write(rel, text);
}

function patchStore() {
  const rel = 'src/store/onboardingStore.ts';
  let text = read(rel);
  text = maybe(text,
`    districtCooling: boolean;
    // Institutional / Majlis / Mosque Specific`,
`    districtCooling: boolean;
    electrical?: boolean;
    plumbing?: boolean;
    drainage?: boolean;
    pumps?: boolean;
    emergencyLighting?: boolean;
    accessControl?: boolean;
    bms?: boolean;
    iotSensors?: boolean;
    gym?: boolean;
    dataCenterCriticality?: boolean;
    // Institutional / Majlis / Mosque Specific`,
'Stage 2 additional systems types');
  text = maybe(text,
`    toggleAddOn: (id: string) => void;
    setContractId: (id: string) => void;`,
`    toggleAddOn: (id: string) => void;
    setSelectedAddOns: (ids: string[]) => void;
    setContractId: (id: string) => void;`,
'setSelectedAddOns interface');
  text = maybe(text,
`        hasBmu: property.bmu,
        addOns: selectedAddOns,`,
`        hasBmu: property.bmu,
        hasGym: Boolean((property as any).gym),
        hasDataCenterCriticality: Boolean((property as any).dataCenterCriticality || (property as any).iotSensors || (property as any).bms),
        addOns: selectedAddOns,`,
'quote critical system flags');
  text = maybe(text,
`    districtCooling: false,
    majlis: false,`,
`    districtCooling: false,
    electrical: false,
    plumbing: false,
    drainage: false,
    pumps: false,
    emergencyLighting: false,
    accessControl: false,
    bms: false,
    iotSensors: false,
    gym: false,
    dataCenterCriticality: false,
    majlis: false,`,
'default additional systems');
  text = maybe(text,
`                    newProperties[index] = { ...newProperties[index], ...data };
                    return { properties: newProperties };`,
`                    const existing = newProperties[index] || (index === 0 ? state.propertyData : defaultProperty);
                    const merged = { ...existing, ...data, id: existing.id || ('prop-' + (index + 1)) };
                    newProperties[index] = merged;
                    return index === 0 ? { properties: newProperties, propertyData: merged } : { properties: newProperties };`,
'robust updateProperty');
  text = maybe(text,
`             toggleAddOn: (id) => {
                set((state) => ({
                    selectedAddOns: state.selectedAddOns.includes(id)
                        ? state.selectedAddOns.filter(a => a !== id)
                        : [...state.selectedAddOns, id]
                }));
                get().calculateSummary();
            },
            setContractId: (contractId) => set({ contractId }),`,
`             toggleAddOn: (id) => {
                set((state) => ({
                    selectedAddOns: state.selectedAddOns.includes(id)
                        ? state.selectedAddOns.filter(a => a !== id)
                        : [...state.selectedAddOns, id]
                }));
                get().calculateSummary();
            },
            setSelectedAddOns: (ids) => {
                set({ selectedAddOns: Array.from(new Set(ids)) });
                get().calculateSummary();
            },
            setContractId: (contractId) => set({ contractId }),`,
'setSelectedAddOns implementation');
  write(rel, text);
}

function patchSystemsDataStep() {
  const rel = 'src/components/onboarding/SystemsDataStep.tsx';
  let text = read(rel);
  text = maybe(text,
`import { useOnboardingStore } from '../../store/onboardingStore';`,
`import { useOnboardingStore } from '../../store/onboardingStore';
import { ADD_ON_PRICING, calculateAddOnAnnualValue } from '../../utils/calculateUaeQuote2026';`,
'pricing import');
  text = maybe(text,
`    const { properties, updateProperty, selectedAddOns, toggleAddOn } = useOnboardingStore();`,
`    const { properties, propertyData, updateProperty, selectedAddOns, toggleAddOn, setSelectedAddOns, calculateSummary } = useOnboardingStore();`,
'store selectors');
  text = maybe(text,
`    const activeProperty = properties[0] || ({} as any);
    const safeSelectedAddOns = Array.isArray(selectedAddOns) ? selectedAddOns : [];`,
`    const activeProperty = properties[0] || propertyData || ({} as any);
    const safeSelectedAddOns = Array.isArray(selectedAddOns) ? selectedAddOns : [];
    const priceForAddon = (id: string) => calculateAddOnAnnualValue([id], {
        units: activeProperty.units,
        floors: activeProperty.floors,
        offices: activeProperty.offices,
        shops: activeProperty.shops
    });
    const readable = (value: string | undefined, fallback: string) => (!value || value.includes('.') ? fallback : value);`,
'active property fallback and pricing');
  const systemsAndAddons = `const systemGroups = [
        {
            title: 'Core MEP Systems',
            systems: [
                { key: 'hvac', label: t('onboarding.sys.hvac'), icon: <Wind size={18} /> },
                { key: 'districtCooling', label: t('onboarding.sys.districtCooling'), icon: <Wind size={18} /> },
                { key: 'electrical', label: 'Electrical / DB Panels', icon: <Zap size={18} /> },
                { key: 'plumbing', label: 'Plumbing Network', icon: <Droplets size={18} /> },
                { key: 'drainage', label: 'Drainage / Sewerage', icon: <Waves size={18} /> },
                { key: 'pumps', label: 'Pumps / Booster Systems', icon: <Activity size={18} /> },
                { key: 'tank', label: t('onboarding.sys.tank'), icon: <Droplets size={18} /> },
                { key: 'gen', label: t('onboarding.sys.gen'), icon: <Zap size={18} /> },
                { key: 'lifts', label: t('onboarding.sys.lifts'), icon: <Zap size={18} /> },
            ]
        },
        {
            title: 'Life Safety + Compliance',
            systems: [
                { key: 'fireAlarm', label: t('onboarding.sys.fireAlarm'), icon: <Flame size={18} /> },
                { key: 'firePump', label: t('onboarding.sys.firePump'), icon: <Flame size={18} /> },
                { key: 'emergencyLighting', label: 'Emergency Lighting', icon: <ShieldCheck size={18} /> },
                { key: 'sira', label: t('onboarding.sys.sira'), icon: <ShieldCheck size={18} /> },
                { key: 'accessControl', label: 'Access Control', icon: <ShieldCheck size={18} /> },
                { key: 'bmu', label: t('onboarding.sys.bmu'), icon: <Building size={18} /> },
                { key: 'wasteMan', label: t('onboarding.sys.wasteMan'), icon: <Trash2 size={18} /> },
            ]
        },
        {
            title: 'Amenities + Digital Readiness',
            systems: [
                { key: 'pool', label: t('onboarding.sys.pool'), icon: <Waves size={18} /> },
                { key: 'centralLPG', label: t('onboarding.sys.gasSystem'), icon: <Flame size={18} /> },
                { key: 'greaseTrap', label: t('onboarding.sys.greaseTrap'), icon: <Waves size={18} /> },
                { key: 'gym', label: 'Gym / Fitness Amenities', icon: <Activity size={18} /> },
                { key: 'majlisGarden', label: t('onboarding.sys.majlisGarden'), icon: <Sun size={18} /> },
                { key: 'solarIntegration', label: t('onboarding.sys.solarIntegration'), icon: <Sun size={18} /> },
                { key: 'evReadiness', label: t('onboarding.sys.evReadiness'), icon: <Car size={18} /> },
                { key: 'bms', label: 'BMS / Smart Controls', icon: <Activity size={18} /> },
                { key: 'iotSensors', label: 'IoT Sensor Readiness', icon: <Camera size={18} /> },
            ]
        }
    ];

    const baseAddOns = [
        { id: 'fire_safety', icon: ShieldAlert, name: ADD_ON_PRICING.fire_safety.label, desc: 'Civil Defense compliance checks, alarm readiness and certification support.', mandatory: true, showIf: true, reason: 'Mandatory baseline for UAE occupied assets.' },
        { id: 'water_tank', icon: Droplets, name: ADD_ON_PRICING.water_tank.label, desc: 'Quarterly cleaning, sterilization and hygiene documentation.', mandatory: !!activeProperty.tank, showIf: !!activeProperty.tank, reason: 'Required when water tanks exist.' },
        { id: 'elevator_amc', icon: Activity, name: ADD_ON_PRICING.elevator_amc.label, desc: 'Lift inspections, safety checks and service coordination.', mandatory: (activeProperty.floors || 0) > 2 || (activeProperty.lifts || 0) > 0, showIf: (activeProperty.floors || 0) > 2 || (activeProperty.lifts || 0) > 0, reason: 'Required for multi-floor assets.' },
        { id: 'hvac_pm', icon: Wind, name: ADD_ON_PRICING.hvac_pm.label, desc: 'AC inspections, filters, coils, drain lines and performance checks.', mandatory: !!activeProperty.hvac, showIf: true, reason: 'UAE climate makes HVAC continuity mission-critical.' },
        { id: 'mep_support', icon: Wrench, name: ADD_ON_PRICING.mep_support.label, desc: 'Integrated mechanical, electrical and plumbing preventive support.', mandatory: false, showIf: true, reason: 'Core operational resilience layer.' },
        { id: 'cleaning', icon: Droplets, name: ADD_ON_PRICING.cleaning.label, desc: 'Common area cleaning and scheduled hygiene operations.', mandatory: false, showIf: true, reason: 'Hygiene and shared-area continuity.' },
        { id: 'manpower', icon: Activity, name: ADD_ON_PRICING.manpower.label, desc: 'Additional manpower support for large or high-footfall assets.', mandatory: false, showIf: true, reason: 'Adds dedicated manpower capacity.' },
        { id: 'security', icon: ShieldAlert, name: ADD_ON_PRICING.security.label, desc: 'Guarding coordination, access control and incident logging.', mandatory: false, showIf: true, reason: 'Optional manpower layer for towers, retail and high-value assets.' },
        { id: 'cctv', icon: Camera, name: ADD_ON_PRICING.cctv.label, desc: 'CCTV / surveillance maintenance and readiness checks.', mandatory: !!activeProperty.sira, showIf: true, reason: 'Security and SIRA / ADMCC readiness.' },
        { id: 'technician_standby', icon: Activity, name: ADD_ON_PRICING.technician_standby.label, desc: 'Dedicated on-site technician for VIP events or critical operations.', mandatory: false, showIf: !!activeProperty.majlis || activeProperty.propertyType === 'Hotel', reason: 'Crucial for VIP operational continuity.' },
        { id: 'emergency_priority', icon: ShieldAlert, name: ADD_ON_PRICING.emergency_priority.label, desc: 'Priority emergency response layer for urgent incidents.', mandatory: false, showIf: true, reason: 'Improves SLA response posture.' },
        { id: 'pest_control', icon: ShieldAlert, name: ADD_ON_PRICING.pest_control.label, desc: 'Quarterly municipality-approved pest control treatments.', mandatory: false, showIf: true, reason: 'Standard preventive hygiene measure.' },
        { id: 'landscaping', icon: Waves, name: ADD_ON_PRICING.landscaping.label, desc: 'Garden maintenance, pruning and irrigation system checks.', mandatory: false, showIf: activeProperty.propertyType === 'Villa' || !!activeProperty.majlis, reason: 'Essential for outdoor and garden spaces.' },
        { id: 'move_in_out_inspection', icon: Check, name: ADD_ON_PRICING.move_in_out_inspection.label, desc: 'Snagging and condition report before/after tenancy or event.', mandatory: false, showIf: true, reason: 'Protects asset condition and lifecycle.' },
        { id: 'office_units', icon: Building, name: ADD_ON_PRICING.office_units.label, desc: 'Office unit, pantry, lighting and fit-out coordination checks.', mandatory: false, showIf: (activeProperty.offices || 0) > 0, reason: 'Office units need separate occupancy tracking.' },
        { id: 'retail_shops', icon: Building, name: ADD_ON_PRICING.retail_shops.label, desc: 'Retail shop support for signage, fit-out, MEP and occupancy readiness.', mandatory: false, showIf: (activeProperty.shops || 0) > 0 || String(activeProperty.propertyType || '').toLowerCase().includes('mall'), reason: 'Retail units require separate operating scope.' },
        { id: 'parking_management', icon: Camera, name: ADD_ON_PRICING.parking_management.label, desc: 'Parking access coordination and incident reporting.', mandatory: false, showIf: (activeProperty.parkingCapacity || 0) > 0 || (activeProperty.units || 0) >= 20, reason: 'Recommended for towers and high-occupancy assets.' },
        { id: 'waste_management', icon: Trash2, name: ADD_ON_PRICING.waste_management.label, desc: 'Waste room checks and disposal schedule coordination.', mandatory: !!activeProperty.wasteMan, showIf: true, reason: 'Protects hygiene and compliance.' },
        { id: 'generator', icon: Zap, name: ADD_ON_PRICING.generator.label, desc: 'Generator maintenance and emergency readiness checks.', mandatory: !!activeProperty.gen, showIf: !!activeProperty.gen, reason: 'Backup power requires specialist AMC.' },
        { id: 'pca_audit', icon: ShieldCheck, name: ADD_ON_PRICING.pca_audit.label, desc: 'Property condition assessment and compliance baseline audit.', mandatory: (activeProperty.age || 0) > 15, showIf: true, reason: 'Creates an institutional asset baseline before contract activation.' },
    ].map((addon) => ({ ...addon, price: priceForAddon(addon.id) })).filter((addon) => addon.showIf);

    const allAddOns = baseAddOns;`;
  text = text.replace(/const systemGroups = \[[\s\S]*?\];\n\n    const allAddOns = \[[\s\S]*?\]\.filter\(\(addon\) => addon\.showIf\);/, systemsAndAddons);
  text = maybe(text,
`    const selectedVisibleAddOns = allAddOns.filter((addon) => safeSelectedAddOns.includes(addon.id) || addon.mandatory);
    const addOnTotal = selectedVisibleAddOns.reduce((sum, addon) => sum + addon.price, 0);`,
`    const selectedVisibleAddOns = allAddOns.filter((addon) => safeSelectedAddOns.includes(addon.id) || addon.mandatory);
    const addOnTotal = selectedVisibleAddOns.reduce((sum, addon) => sum + addon.price, 0);
    const mandatoryVisibleAddOnIds = allAddOns.filter((addon) => addon.mandatory).map((addon) => addon.id);
    const handleContinue = () => {
        setSelectedAddOns(Array.from(new Set([...safeSelectedAddOns, ...mandatoryVisibleAddOnIds])));
        calculateSummary();
        onNext();
    };`,
'continue handler persists mandatory add-ons');
  text = maybe(text, `{t('onboarding.systems_audit')}`, `{readable(t('onboarding.systems_audit'), 'Systems & Add-ons Audit')}`, 'systems audit fallback');
  text = maybe(text, `{t('onboarding.systems_matrix')}`, `{readable(t('onboarding.systems_matrix'), 'Systems Matrix')}`, 'systems matrix fallback');
  text = maybe(text, `{t('onboarding.systems_desc')}`, `{readable(t('onboarding.systems_desc'), 'Select every critical building system. These choices control SLA scope, add-ons, dispatch readiness and quote accuracy.')}`, 'systems desc fallback');
  text = maybe(text, `{t('onboarding.addons_title')}`, `{readable(t('onboarding.addons_title'), 'Operational Add-ons')}`, 'addons title fallback');
  text = maybe(text, `{t('onboarding.addons_subtitle')}`, `{readable(t('onboarding.addons_subtitle'), 'Select Additional Service Layers')}`, 'addons subtitle fallback');
  text = maybe(text, `{t('onboarding.addons_desc')}`, `{readable(t('onboarding.addons_desc'), 'Add manpower, compliance, hygiene, standby and specialist services directly to the same systems page before commercial confirmation.')}`, 'addons desc fallback');
  text = maybe(text, `onClick={onNext}\n                        endIcon=`, `onClick={handleContinue}\n                        endIcon=`, 'systems continue button');
  write(rel, text);
}

function patchPropertyOnboardingPage() {
  const rel = 'src/pages/PropertyOnboardingPage.tsx';
  let text = read(rel);
  text = maybe(text, `        'Systems',`, `        'Systems + Add-ons',`, 'visible stage 2 label');
  text = maybe(text, `readable(t('onboarding.systems'), 'Systems Add-ons'),`, `readable(t('onboarding.systems'), 'Systems + Add-ons'),`, 'internal stage 2 label');
  write(rel, text);
}

function patchCommercialTermsStep() {
  const rel = 'src/components/onboarding/CommercialTermsStep.tsx';
  let text = read(rel);
  text = maybe(text,
`    const { properties, updateProperty, calculateSummary, portfolioSummary } = useOnboardingStore();`,
`    const { properties, propertyData, updateProperty, calculateSummary, portfolioSummary } = useOnboardingStore();`,
'commercial store selector');
  text = maybe(text,
`    const property = properties[activePropertyIndex] || ({} as any);`,
`    const property = properties[activePropertyIndex] || propertyData || ({} as any);`,
'commercial property fallback');
  text = maybe(text,
`    const quote = portfolioSummary.quoteResults?.[property?.id];`,
`    const quote = portfolioSummary.quoteResults?.[property?.id] || Object.values(portfolioSummary.quoteResults || {})[0];`,
'commercial quote fallback');
  write(rel, text);
}

function patchContractSignatureStep() {
  const rel = 'src/components/onboarding/ContractSignatureStep.tsx';
  let text = read(rel);
  text = maybe(text,
`const modeLabel = (strategy?: string) => {
    if (strategy === 'pm') return 'Property Management Only / إدارة العقار فقط';
    if (strategy === 'hybrid') return 'Maintenance + Property Management / الصيانة وإدارة العقار معاً';
    return 'Maintenance Only / الصيانة فقط';
}`,
`const modeLabel = (strategy?: string) => {
    if (strategy === 'pm' || strategy === 'pm_only' || strategy === 'rent') return 'Property Management Only / إدارة العقار فقط';
    if (strategy === 'hybrid' || strategy === 'both') return 'Maintenance + Property Management / الصيانة وإدارة العقار معاً';
    return 'Maintenance Only / الصيانة فقط';
}`,
'contract mode labels');
  text = maybe(text,
`        properties,
        portfolioSummary,
        isContractSigned,`,
`        properties,
        propertyData,
        portfolioSummary,
        calculateSummary,
        isContractSigned,`,
'contract store selector');
  text = maybe(text,
`    const primaryProperty = properties[0];
    const quote = portfolioSummary.quoteResults?.[primaryProperty?.id];`,
`    useEffect(() => {
        calculateSummary();
    }, [calculateSummary, properties]);

    const primaryProperty = properties[0] || propertyData;
    const quote = portfolioSummary.quoteResults?.[primaryProperty?.id] || Object.values(portfolioSummary.quoteResults || {})[0];`,
'contract property and quote fallback');
  write(rel, text);
}

function patchPaymentSummaryStep() {
  const rel = 'src/components/onboarding/PaymentSummaryStep.tsx';
  let text = read(rel);
  text = maybe(text,
`        setPaymentManifest
    } = useOnboardingStore();`,
`        setPaymentManifest,
        calculateSummary
    } = useOnboardingStore();`,
'payment summary calculate selector');
  text = maybe(text,
`    const [isGenerating, setIsGenerating] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    const annualTotal = resolveMoney(`,
`    const [isGenerating, setIsGenerating] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    React.useEffect(() => {
        calculateSummary();
    }, [calculateSummary, properties]);

    const firstQuote = Object.values(portfolioSummary?.quoteResults || {}).find((quote: any) => Number(quote?.annualTotal) > 0) as any;
    const annualTotal = resolveMoney(
        firstQuote?.annualTotal,`,
'payment summary quote fallback');
  text = maybe(text,
`        valuationResult?.portfolioIntelligence?.finalAnnualPrice,`,
`        valuationResult?.portfolioIntelligence?.finalAnnualPrice,`,
'noop marker');
  write(rel, text);
}

patchProtectedRoute();
patchAppShell();
patchHeader();
patchNavigationControl();
patchStore();
patchSystemsDataStep();
patchPropertyOnboardingPage();
patchCommercialTermsStep();
patchContractSignatureStep();
patchPaymentSummaryStep();

console.log('\nCritical master patch complete. Run: npm run lint && npm run build');
console.log('Fixes: duplicate public shell, AI Studio access, Stage 2 Systems + Add-ons, quote/add-on mismatch, and contract/payment zero-value fallbacks.');
