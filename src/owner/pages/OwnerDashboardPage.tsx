import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, CircularProgress, Button, alpha, Alert
} from '@mui/material';
import {
    Clock, Lock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, collection, query, where, getDocs, doc, getDoc } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import OwnerDashboardResolvedPage from './OwnerDashboardResolvedPage';

export default function OwnerDashboardPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [dashboardState, setDashboardState] = useState<'locked' | 'pending' | 'active'>('locked');
    
    const [stats, setStats] = useState({
        properties: 0,
        units: 0,
        tenants: 0,
        tickets: 0,
        rentCollected: 0,
        payoutsPending: 0,
        maintenanceCost: 0
    });
    const [properties, setProperties] = useState<any[]>([]);
    const [missingInfo, setMissingInfo] = useState<{ iban: boolean; units: boolean }>({ iban: false, units: false });
    const [contractScope, setContractScope] = useState<string>('');

    useEffect(() => {
        if (!user?.email && !user?.uid) {
            setLoading(false);
            return;
        }

        const resolveOwnerAndLoadData = async () => {
            try {
                setLoading(true);
                setLoadError('');

                // 1. Resolve dashboard state first
                let resolvedDashboardState: 'locked' | 'pending' | 'active' = 'locked';
                try {
                    const ownerRef = doc(db, 'owners', user.uid!);
                    const ownerSnap = await getDoc(ownerRef);
                    
                    if (ownerSnap.exists()) {
                        const ownerData = ownerSnap.data();
                        if (ownerData.dashboardUnlocked === true && ownerData.status === 'ACTIVE') {
                            resolvedDashboardState = 'active';
                        } else {
                            resolvedDashboardState = 'pending';
                        }
                    } else {
                        const userRef = doc(db, 'users', user.uid!);
                        const userSnap = await getDoc(userRef);
                        
                        if (userSnap.exists()) {
                            const userData = userSnap.data();
                            if (userData.dashboardUnlocked === true && userData.status === 'ACTIVE') {
                                resolvedDashboardState = 'active';
                            } else {
                                resolvedDashboardState = 'pending';
                            }
                        } else {
                            resolvedDashboardState = 'locked';
                        }
                    }
                } catch (err) {
                    console.warn('[OwnerDashboard] Silent fail checking dashboard state document:', err);
                    resolvedDashboardState = 'locked';
                }

                setDashboardState(resolvedDashboardState);

                // If not active, stop loading further data
                if (resolvedDashboardState !== 'active') {
                    setLoading(false);
                    return;
                }

                // 2. Resolve owner identity set (Emails and UIDs)
                const resolvedEmails = new Set<string>();
                const resolvedUids = new Set<string>();

                resolvedUids.add(user.uid);
                if (user.email) resolvedEmails.add(user.email.toLowerCase());

                try {
                    const ownerRef = doc(db, 'owners', user.uid);
                    const ownerSnap = await getDoc(ownerRef);
                    if (ownerSnap.exists()) {
                        const data = ownerSnap.data();
                        if (data.ownerEmail) resolvedEmails.add(data.ownerEmail.toLowerCase());
                        if (data.email) resolvedEmails.add(data.email.toLowerCase());
                        if (data.ownerUid) resolvedUids.add(data.ownerUid);
                        if (data.ownerId) resolvedUids.add(data.ownerId);
                        if (Array.isArray(data.linkedOwnerIds)) {
                            data.linkedOwnerIds.forEach((id: string) => resolvedUids.add(id));
                        }
                    }

                    const userRef = doc(db, 'users', user.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        if (data.ownerEmail) resolvedEmails.add(data.ownerEmail.toLowerCase());
                        if (data.email) resolvedEmails.add(data.email.toLowerCase());
                        if (data.ownerUid) resolvedUids.add(data.ownerUid);
                        if (data.ownerId) resolvedUids.add(data.ownerId);
                        if (Array.isArray(data.linkedOwnerIds)) {
                            data.linkedOwnerIds.forEach((id: string) => resolvedUids.add(id));
                        }
                    }
                } catch (err) {
                    console.warn('[OwnerDashboard] Silent fail during user/owner detail lookup:', err);
                }

                // 3. Resolve active contracts and settings
                const contractsMap = new Map<string, any>();
                try {
                    for (const uid of Array.from(resolvedUids)) {
                        const q1 = query(collection(db, 'contracts'), where('ownerUid', '==', uid));
                        const s1 = await getDocs(q1);
                        s1.docs.forEach(d => contractsMap.set(d.id, d.data()));

                        const q2 = query(collection(db, 'contracts'), where('ownerId', '==', uid));
                        const s2 = await getDocs(q2);
                        s2.docs.forEach(d => contractsMap.set(d.id, d.data()));
                    }

                    for (const email of Array.from(resolvedEmails)) {
                        const q3 = query(collection(db, 'contracts'), where('ownerEmail', '==', email));
                        const s3 = await getDocs(q3);
                        s3.docs.forEach(d => contractsMap.set(d.id, d.data()));

                        const q4 = query(collection(db, 'contracts'), where('emailDelivery.recipient', '==', email));
                        const s4 = await getDocs(q4);
                        s4.docs.forEach(d => contractsMap.set(d.id, d.data()));
                    }
                } catch (err) {
                    console.warn('[OwnerDashboard] Silent fail during contracts retrieval:', err);
                }

                let resolvedScope = '';
                contractsMap.forEach((contract) => {
                    const scope = String(contract.managementScope || contract.contractType || contract.planType || '').toUpperCase();
                    if (scope) resolvedScope = scope;
                    
                    // Extract additional details from contract
                    if (contract.ownerEmail) resolvedEmails.add(contract.ownerEmail.toLowerCase());
                    if (contract.ownerUid) resolvedUids.add(contract.ownerUid);
                    if (contract.ownerId) resolvedUids.add(contract.ownerId);
                });
                setContractScope(resolvedScope);

                // 4. Load property records
                const propertiesMap = new Map<string, any>();
                try {
                    for (const uid of Array.from(resolvedUids)) {
                        const qp1 = query(collection(db, 'properties'), where('ownerId', '==', uid));
                        const sp1 = await getDocs(qp1);
                        sp1.docs.forEach(d => propertiesMap.set(d.id, { id: d.id, ...d.data(), source: 'property record' }));

                        const qp2 = query(collection(db, 'properties'), where('ownerUid', '==', uid));
                        const sp2 = await getDocs(qp2);
                        sp2.docs.forEach(d => propertiesMap.set(d.id, { id: d.id, ...d.data(), source: 'property record' }));
                    }

                    for (const email of Array.from(resolvedEmails)) {
                        const qp3 = query(collection(db, 'properties'), where('ownerEmail', '==', email));
                        const sp3 = await getDocs(qp3);
                        sp3.docs.forEach(d => propertiesMap.set(d.id, { id: d.id, ...d.data(), source: 'property record' }));
                    }
                } catch (err) {
                    console.warn('[OwnerDashboard] Silent fail during properties retrieval:', err);
                }

                // 5. Load property passports
                const passportsMap = new Map<string, any>();
                try {
                    for (const uid of Array.from(resolvedUids)) {
                        const qpp1 = query(collection(db, 'propertyPassports'), where('ownerId', '==', uid));
                        const spp1 = await getDocs(qpp1);
                        spp1.docs.forEach(d => passportsMap.set(d.id, { id: d.id, ...d.data(), source: 'official passport' }));

                        const qpp2 = query(collection(db, 'propertyPassports'), where('ownerUid', '==', uid));
                        const spp2 = await getDocs(qpp2);
                        spp2.docs.forEach(d => passportsMap.set(d.id, { id: d.id, ...d.data(), source: 'official passport' }));
                    }

                    for (const email of Array.from(resolvedEmails)) {
                        const qpp3 = query(collection(db, 'propertyPassports'), where('ownerEmail', '==', email));
                        const spp3 = await getDocs(qpp3);
                        spp3.docs.forEach(d => passportsMap.set(d.id, { id: d.id, ...d.data(), source: 'official passport' }));
                    }
                } catch (err) {
                    console.warn('[OwnerDashboard] Silent fail during property passports retrieval:', err);
                }

                // 6. Merge embedded contract properties
                contractsMap.forEach((contract) => {
                    const embeddedProps = contract.properties || contract.propertyList || contract.assets || [];
                    if (Array.isArray(embeddedProps)) {
                        embeddedProps.forEach((p: any, idx: number) => {
                            const id = p.propertyId || p.id || `contract-asset-${idx}`;
                            const name = p.propertyName || p.name || p.title || '';
                            const existing = propertiesMap.get(id) || passportsMap.get(id) || {};
                            
                            propertiesMap.set(id, {
                                id,
                                propertyName: name,
                                emirate: p.emirate || p.location || existing.emirate || 'UAE',
                                propertyType: p.type || p.propertyType || existing.propertyType || 'Residential',
                                units: Number(p.units || p.totalUnits || p.unitCount || existing.units || 0),
                                floors: Number(p.floors || existing.floors || 0),
                                rooms: Number(p.rooms || existing.rooms || 0),
                                halls: Number(p.halls || existing.halls || 0),
                                source: 'active contract',
                                ...existing,
                                ...p
                            });
                        });
                    }
                });

                // Merge passports into main property records map
                passportsMap.forEach((passport, id) => {
                    const existing = propertiesMap.get(id) || {};
                    propertiesMap.set(id, {
                        id,
                        propertyName: passport.propertyName || passport.name || existing.propertyName || 'Property',
                        emirate: passport.emirate || passport.location || existing.emirate || 'UAE',
                        propertyType: passport.propertyType || passport.type || existing.propertyType || 'Residential',
                        units: Number(passport.units || passport.totalUnits || existing.units || 0),
                        floors: Number(passport.floors || existing.floors || 0),
                        rooms: Number(passport.rooms || existing.rooms || 0),
                        halls: Number(passport.halls || existing.halls || 0),
                        source: existing.source || 'official passport',
                        passportStatus: passport.status || 'ACTIVE',
                        ...existing,
                        ...passport
                    });
                });

                // 7. Calculate stats and verify IBAN/Missing info
                let totalUnitCount = 0;
                let activeTenantCount = 0;
                let rentTotal = 0;
                let maintTotal = 0;
                let unitsMissingDetails = false;

                // Query bank account status
                let isIbanMissing = true;
                try {
                    for (const uid of Array.from(resolvedUids)) {
                        const bankQ = query(collection(db, 'ownerBankAccounts'), where('ownerId', '==', uid));
                        const bankSnap = await getDocs(bankQ);
                        if (!bankSnap.empty) {
                            isIbanMissing = false;
                            break;
                        }
                    }
                } catch (err) {
                    console.warn('[OwnerDashboard] Silent fail checking IBAN document:', err);
                }

                passportsMap.forEach((passport) => {
                    totalUnitCount += Number(passport.totalUnits || passport.units || 0);
                    activeTenantCount += Number(passport.occupiedUnits || passport.activeTenants || 0);
                    rentTotal += Number(passport.rentCollectedTotal || 0);
                    maintTotal += Number(passport.maintenanceCostTotal || 0);
                    if (!Array.isArray(passport.rentPerUnitTable) || passport.rentPerUnitTable.length === 0) {
                        unitsMissingDetails = true;
                    }
                });

                setMissingInfo({ iban: isIbanMissing, units: unitsMissingDetails });

                // Standardize list structure and filter placeholders if real assets exist
                const mergedList = Array.from(propertiesMap.values()).map(p => {
                    return {
                        id: p.id,
                        propertyName: p.propertyName || p.name || '',
                        emirate: p.emirate || p.location || 'UAE',
                        propertyType: p.propertyType || p.type || p.assetType || 'Residential',
                        units: Number(p.units || p.totalUnits || p.unitsCount || p.numberOfUnits || 0),
                        floors: Number(p.floors || p.floorNumber || 0),
                        rooms: Number(p.rooms || 0),
                        halls: Number(p.halls || 0),
                        source: p.source || 'property record',
                        passportStatus: p.passportStatus || p.status || 'ACTIVE',
                        ...p
                    };
                });

                const realAssetExists = mergedList.some(p => {
                    const name = String(p.propertyName).trim().toLowerCase();
                    return name !== '' && name !== 'new asset' && name !== 'property' &&
                           (p.units > 0 || p.floors > 0 || p.rooms > 0 || p.halls > 0);
                });

                let finalPropertiesList = mergedList;
                if (realAssetExists) {
                    finalPropertiesList = mergedList.filter(p => {
                        const name = String(p.propertyName).trim().toLowerCase();
                        const isPlaceholder = (name === '' || name === 'new asset' || name === 'property') &&
                                              p.units === 0 && p.floors === 0 && p.rooms === 0 && p.halls === 0;
                        return !isPlaceholder;
                    });
                }

                // Sort properties so Al Ain Falaj Hazza appears above New Asset / 0 units
                finalPropertiesList.sort((a, b) => {
                    const aName = String(a.propertyName).toLowerCase();
                    const bName = String(b.propertyName).toLowerCase();
                    
                    if (aName.includes('al ain')) return -1;
                    if (bName.includes('al ain')) return 1;
                    return b.units - a.units;
                });

                setProperties(finalPropertiesList);

                // Set fallback values for stats if not resolved from passport calculations
                const fallbackUnits = finalPropertiesList.reduce((acc, p) => acc + Number(p.units || 0), 0);
                setStats({
                    properties: finalPropertiesList.length,
                    units: totalUnitCount || fallbackUnits,
                    tenants: activeTenantCount || 0,
                    tickets: stats.tickets || 0,
                    rentCollected: rentTotal || 0,
                    payoutsPending: rentTotal * 0.92,
                    maintenanceCost: maintTotal || 0
                });

                setLoading(false);
            } catch (err: any) {
                console.error('[OwnerDashboard] Failed to resolve control room details:', err);
                setLoadError(err?.message || 'Portfolio Control Room data failed to resolve.');
                setLoading(false);
            }
        };

        resolveOwnerAndLoadData();
    }, [user?.email, user?.uid]);

    if (loading) return (
        <Box sx={{ height: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 3 }}>
                {t('dash.syncing_portfolio') || 'Syncing Sovereign Control Room...'}
            </Typography>
        </Box>
    );

    // Show pending activation panel
    if (dashboardState === 'pending') {
        return (
            <Box sx={{ height: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, pb: 6 }}>
                <Paper sx={{ p: 6, textAlign: 'center', maxWidth: 500, bgcolor: 'rgba(22, 22, 24, 0.8)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                    <Clock size={64} color={binThemeTokens.gold} style={{ margin: '0 auto 24px' }} />
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>
                        {t('dash.onboarding_submitted') || 'Onboarding Submitted'}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3, lineHeight: 1.6 }}>
                        {t('dash.onboarding_pending_desc') || 'Your onboarding is submitted. Admin is verifying documents, payment, and contract activation. This typically takes 1-3 business days.'}
                    </Typography>
                    <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, color: binThemeTokens.gold, textAlign: 'left' }}>
                        <Typography variant="caption" fontWeight="900" sx={{ display: 'block', mb: 1 }}>WHAT HAPPENS NEXT:</Typography>
                        <Typography variant="caption" component="div" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                            ✓ Admin reviews your property documents and KYC
                        </Typography>
                        <Typography variant="caption" component="div" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                            ✓ Payment verification and settlement
                        </Typography>
                        <Typography variant="caption" component="div" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                            ✓ Contract activation and dashboard unlock
                        </Typography>
                    </Alert>
                    <Button 
                        variant="outlined" 
                        sx={{ mt: 4, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 900, px: 4 }}
                        onClick={() => navigate('/owner/onboarding-status')}
                    >
                        {t('dash.check_status') || 'Check Status'}
                    </Button>
                </Paper>
            </Box>
        );
    }

    // Show locked state
    if (dashboardState === 'locked') {
        return (
            <Box sx={{ height: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, pb: 6 }}>
                <Paper sx={{ p: 6, textAlign: 'center', maxWidth: 500, bgcolor: 'rgba(22, 22, 24, 0.8)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                    <Lock size={64} color="#ef4444" style={{ margin: '0 auto 24px' }} />
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>
                        {t('dash.dashboard_locked') || 'Dashboard Locked'}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>
                        {t('dash.dashboard_locked_desc') || 'Your dashboard will unlock after successful onboarding activation.'}
                    </Typography>
                    <Button 
                        variant="contained" 
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4 }}
                        onClick={() => navigate('/onboarding')}
                    >
                        {t('dash.start_onboarding') || 'Start Onboarding'}
                    </Button>
                </Paper>
            </Box>
        );
    }

    return (
        <Box>
            {loadError && (
                <Alert severity="error" sx={{ mb: 4, bgcolor: 'rgba(239,68,68,0.1)', color: '#fecaca', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 4 }}>
                    {loadError}
                </Alert>
            )}

            <OwnerDashboardResolvedPage
                user={user}
                t={t}
                isRTL={isRTL}
                properties={properties}
                stats={stats}
                contractScope={contractScope}
                missingInfo={missingInfo}
            />
        </Box>
    );
}
