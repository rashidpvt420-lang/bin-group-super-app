import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Avatar, CircularProgress, Chip, Stack } from '@mui/material';
import { useRole } from '../../context/RoleContext';
import { db, collection, query, where, getDocs } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { User, Home, Phone, Mail } from 'lucide-react';

export default function TenantProfilePage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [unitData, setUnitData] = useState<any>(null);
    const [propertyData, setPropertyData] = useState<any>(null);

    useEffect(() => {
        const fetchProfileData = async () => {
            if (!user?.uid) return;
            try {
                let unitSnap = await getDocs(query(collection(db, "units"), where("tenantId", "==", user.uid)));
                if (unitSnap.empty && user.email) {
                    unitSnap = await getDocs(query(collection(db, "units"), where("tenantEmail", "==", user.email.toLowerCase())));
                }
                
                if (!unitSnap.empty) {
                    const uData: any = { id: unitSnap.docs[0].id, ...unitSnap.docs[0].data() };
                    setUnitData(uData);

                    if (uData.propertyId) {
                        const propSnap = await getDocs(query(collection(db, "properties"), where("__name__", "==", uData.propertyId)));
                        if (!propSnap.empty) {
                            setPropertyData(propSnap.docs[0].data());
                        }
                    }
                }
            } catch (err) {
                console.error("Profile fetch failed:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchProfileData();
    }, [user]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 4 }}>Tenant Profile</Typography>

            <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} alignItems="center">
                    <Avatar sx={{ width: 100, height: 100, bgcolor: binThemeTokens.gold, color: '#000' }}>
                        {user?.displayName?.charAt(0) || <User size={40} />}
                    </Avatar>
                    <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
                        <Typography variant="h5" fontWeight="900" color="#FFF">{user?.displayName || 'Resident'}</Typography>
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}>
                            <Mail size={16} />
                            <Typography variant="body2">{user?.email}</Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent={{ xs: 'center', md: 'flex-start' }} sx={{ mt: 1, color: 'text.secondary' }}>
                            <Phone size={16} />
                            <Typography variant="body2">{user?.phoneNumber || 'No phone registered'}</Typography>
                        </Stack>
                    </Box>
                </Stack>
            </Paper>

            <Typography variant="h6" fontWeight="900" sx={{ color: '#FFF', mb: 2 }}>Assigned Residency</Typography>
            <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                {unitData ? (
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="caption" color="textSecondary">PROPERTY NAME</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF">{propertyData?.name || propertyData?.propertyName}</Typography>
                            <Typography variant="body2" color="textSecondary">{propertyData?.address}</Typography>
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <Typography variant="caption" color="textSecondary">UNIT NUMBER</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF">{unitData.unitNumber}</Typography>
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <Typography variant="caption" color="textSecondary">FLOOR</Typography>
                            <Typography variant="h6" fontWeight="900" color="#FFF">{unitData.floorNumber}</Typography>
                        </Grid>
                        <Grid item xs={12}>
                            <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
                                <Typography variant="caption" color="textSecondary">STATUS</Typography>
                                <Chip label="ACTIVE" size="small" sx={{ bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 900 }} />
                            </Stack>
                        </Grid>
                    </Grid>
                ) : (
                    <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 3 }}>
                        No residency assigned to this account.
                    </Typography>
                )}
            </Paper>
        </Box>
    );
}
