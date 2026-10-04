import React, { useState, useEffect, useRef } from 'react';
import { Alert, Box, Typography, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { db, collection, query, where, getDocs, functions, httpsCallable } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';

export default function TenantEmergencyPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);
    const [unitData, setUnitData] = useState<any>(null);
    const { showToast } = useToast();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const requestIdRef = useRef(`sos_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    useEffect(() => {
        const fetchResidence = async () => {
            if (!user?.uid) return;
            try {
                let unitSnap = await getDocs(query(collection(db, "units"), where("tenantId", "==", user.uid)));
                if (unitSnap.empty) {
                    unitSnap = await getDocs(query(collection(db, "units"), where("tenantUid", "==", user.uid)));
                }
                if (unitSnap.empty && user.email) {
                    unitSnap = await getDocs(query(collection(db, "units"), where("tenantEmail", "==", user.email.toLowerCase())));
                }
                if (!unitSnap.empty) {
                    const uData: any = { id: unitSnap.docs[0].id, ...unitSnap.docs[0].data() };
                    setUnitData(uData);
                }
            } catch (err) {
                console.error("Fetch failed:", err);
            }
        };
        fetchResidence();
    }, [user]);

    const triggerConfirm = () => {
        setConfirmOpen(true);
    };

    const handleEmergencyTrigger = async () => {
        setConfirmOpen(false);
        if (!user || !unitData) return;

        setSubmitting(true);
        try {
            const createTicket = httpsCallable(functions, 'createTenantServiceTicket');
            const result = await createTicket({
                kind: 'EMERGENCY',
                unitId: unitData.id,
                propertyId: unitData.propertyId,
                clientRequestId: requestIdRef.current,
            });
            const { ticketId } = result.data as { ticketId?: string };
            if (!ticketId) throw new Error('Emergency service did not return a ticket ID.');
            navigate(`/tenant/ticket/${ticketId}`);
        } catch (err) {
            console.error(err);
            showToast(isRTL ? 'تعذر إرسال نداء الطوارئ. حاول مرة أخرى أو اتصل بدعم الطوارئ.' : 'Failed to trigger SOS. Please try again or call emergency support.', "error");
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
            {!unitData && (
                <Alert severity="warning" sx={{ maxWidth: 560, mx: 'auto', mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                    {isRTL
                        ? 'لا توجد وحدة سكنية مرتبطة بحسابك. اتصل بإدارة العقار أو بخدمات الطوارئ مباشرة.'
                        : 'No residence is linked to your account. Contact property management or emergency services directly.'}
                </Alert>
            )}

            <Button 
                variant="contained" 
                size="large" 
                onClick={triggerConfirm}
                disabled={submitting || !unitData}
                data-testid="tenant-sos-trigger"
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

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle>{isRTL ? 'تأكيد نداء الطوارئ' : 'Confirm Emergency SOS'}</DialogTitle>
                <DialogContent>
                    <Typography>{isRTL ? 'هل أنت متأكد من إرسال نداء طوارئ من الأولوية الأولى؟' : 'Are you sure you want to trigger a Priority 1 Emergency SOS?'}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
                    <Button onClick={handleEmergencyTrigger} color="error" variant="contained" data-testid="tenant-sos-confirm">{isRTL ? 'إرسال الطوارئ' : 'Trigger SOS'}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
