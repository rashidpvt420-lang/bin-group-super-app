import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Stack, Button, CircularProgress, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, MessageCircle, Phone } from 'lucide-react';

const WHATSAPP_NUMBER = '971552423233';
import { db, collection, addDoc, serverTimestamp, query, where, getDocs } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';

export default function TenantEmergencyPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);
    const [unitData, setUnitData] = useState<any>(null);
    const [propertyData, setPropertyData] = useState<any>(null);

    useEffect(() => {
        const fetchResidence = async () => {
            if (!user?.uid) return;
            try {
                const unitSnap = await getDocs(query(collection(db, "units"), where("tenantId", "==", user.uid)));
                if (!unitSnap.empty) {
                    const uData: any = { id: unitSnap.docs[0].id, ...unitSnap.docs[0].data() };
                    setUnitData(uData);
                    if (uData.propertyId) {
                        const propSnap = await getDocs(query(collection(db, "properties"), where("__name__", "==", uData.propertyId)));
                        if (!propSnap.empty) setPropertyData({ id: propSnap.docs[0].id, ...propSnap.docs[0].data() });
                    }
                }
            } catch (err) {
                console.error("Fetch failed:", err);
            }
        };
        fetchResidence();
    }, [user]);

    const handleEmergencyTrigger = async () => {
        if (!window.confirm("Are you sure you want to trigger a Priority 1 Emergency SOS?")) return;
        if (!user || !unitData) return;

        setSubmitting(true);
        try {
            const docRef = await addDoc(collection(db, 'maintenanceTickets'), {
                tenantId: user.uid,
                tenantUid: user.uid,
                tenantName: user.displayName || 'Resident',
                tenantPhone: user.phoneNumber || '',
                propertyId: unitData.propertyId || '',
                propertyName: propertyData?.name || propertyData?.propertyName || '',
                unitId: unitData.id,
                unitNumber: unitData.unitNumber || '',
                category: 'emergency',
                priority: 'emergency',
                description: 'TENANT TRIGGERED SOS EMERGENCY',
                status: 'emergency_submitted',
                assignedTechnicianId: null,
                requiresImmediateDispatch: true,
                slaMinutes: 60,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            navigate(`/tenant/ticket/${docRef.id}`);
        } catch (err) {
            console.error(err);
            alert("Failed to trigger SOS.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Box sx={{ textAlign: 'center', py: 10, direction: isRTL ? 'rtl' : 'ltr' }}>
            <AlertTriangle size={80} color="#ef4444" style={{ margin: '0 auto', marginBottom: '24px' }} className="animate-pulse" />
            <Typography variant="h3" fontWeight="950" color="#ef4444" sx={{ mb: 2 }}>{t('dash.tenant.emergencySos') || 'EMERGENCY SOS'}</Typography>
            <Typography variant="h6" color="textSecondary" sx={{ mb: 6, maxWidth: 500, mx: 'auto' }}>
                {t('dash.tenant.emergencyDesc') || 'Trigger this only for immediate life-safety or severe property damage incidents (e.g., major flood, complete blackout, fire).'}
            </Typography>

            <Button 
                variant="contained" 
                size="large" 
                onClick={handleEmergencyTrigger}
                disabled={submitting || !unitData}
                sx={{ 
                    bgcolor: '#ef4444', color: '#FFF', 
                    borderRadius: '50px', px: 8, py: 3, 
                    fontSize: '1.2rem', fontWeight: 900,
                    boxShadow: '0 10px 40px rgba(239,68,68,0.4)',
                    '&:hover': { bgcolor: '#dc2626' }
                }}
            >
                {submitting ? <CircularProgress size={28} color="inherit" /> : (t('dash.tenant.triggerSos') || 'TRIGGER SOS DISPATCH')}
            </Button>

            <Divider sx={{ my: 6, maxWidth: 480, mx: 'auto' }} />

            <Typography variant="h6" fontWeight="900" sx={{ mb: 3 }}>Or contact us directly</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
                <Button
                    variant="contained"
                    size="large"
                    startIcon={<MessageCircle size={20} />}
                    onClick={() => {
                        const msg = encodeURIComponent(`EMERGENCY: I need immediate maintenance assistance at my unit.\nTenant: ${user?.displayName || user?.email || ''}\nUnit: ${unitData?.unitNumber || ''}\nProperty: ${propertyData?.name || ''}`);
                        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
                    }}
                    sx={{ bgcolor: '#25D366', color: '#FFF', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3 }}
                >
                    WHATSAPP EMERGENCY
                </Button>
                <Button
                    variant="outlined"
                    size="large"
                    startIcon={<Phone size={20} />}
                    href={`tel:+${WHATSAPP_NUMBER}`}
                    sx={{ borderColor: '#ef4444', color: '#ef4444', fontWeight: 950, px: 4, py: 1.5, borderRadius: 3 }}
                >
                    CALL NOW
                </Button>
            </Stack>
        </Box>
    );
}
