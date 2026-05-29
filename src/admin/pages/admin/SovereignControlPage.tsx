import React, { useState, useEffect } from 'react';
import { 
    Grid, Paper, Typography, Box, Stack, Button, 
    Switch, FormControlLabel, TextField, Divider, alpha,
    List, ListItem, ListItemText, ListItemSecondaryAction,
    IconButton, Chip
} from '@mui/material';
import { 
    ShieldCheck, Shield, Sliders, Save, Plus, 
    Trash2, RefreshCw, AlertCircle, Zap, Clock
} from 'lucide-react';
import { collection, onSnapshot, query, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';
import AdminCrudActions from '../../components/AdminCrudActions';
import LaunchStatusBanner from '../../components/LaunchStatusBanner';
import { filterLaunchRecords, comingSoon } from '../../utils/launchDataHygiene';

interface SystemSetting {
    id: string;
    value: any;
    description: string;
    category: 'SLA' | 'SECURITY' | 'PRICING' | 'FEATURE_FLAG' | 'GENERAL';
    type: 'boolean' | 'number' | 'string' | 'json';
}

export default function SovereignControlPage() {
    const { t } = useLanguage();
    const [settings, setSettings] = useState<SystemSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);

    useEffect(() => {
        const q = query(collection(db, 'systemSettings'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setSettings(filterLaunchRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemSetting))));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleUpdate = async (id: string, value: any) => {
        setSaving(id);
        try {
            comingSoon('System settings are read-only for launch. Enable approval workflow and audit logging before allowing edits.');
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(null);
        }
    };

    const SettingRow = ({ setting }: { setting: SystemSetting }) => (
        <ListItem 
            sx={{ 
                mb: 1, 
                bgcolor: 'rgba(255,255,255,0.01)', 
                borderRadius: 2, 
                border: '1px solid rgba(255,255,255,0.05)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }
            }}
        >
            <ListItemText 
                primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" fontWeight="950" color="#FFF">{String(setting.id || '').toUpperCase()}</Typography>
                        <Chip label={setting.category} size="small" sx={{ fontSize: '0.6rem', height: 16, fontWeight: 900, bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }} />
                    </Stack>
                }
                secondary={<Typography variant="caption" color="textSecondary">{setting.description}</Typography>}
            />
            <ListItemSecondaryAction>
                <Stack direction="row" spacing={2} alignItems="center">
                    {setting.type === 'boolean' ? (
                        <Switch 
                            checked={setting.value} 
                            onChange={(e) => handleUpdate(setting.id, e.target.checked)}
                            disabled={saving === setting.id}
                        />
                    ) : (
                        <TextField 
                            size="small"
                            type={setting.type === 'number' ? 'number' : 'text'}
                            value={setting.value}
                            onChange={(e) => handleUpdate(setting.id, setting.type === 'number' ? Number(e.target.value) : e.target.value)}
                            sx={{ width: 120 }}
                        />
                    )}
                    <AdminCrudActions 
                        id={setting.id}
                        actions={[
                            { type: 'delete', onClick: () => comingSoon('Policy removal is blocked for launch safety.'), requiresConfirm: true }
                        ]}
                    />
                </Stack>
            </ListItemSecondaryAction>
        </ListItem>
    );

    return (
        <AdminPageFrame
            title="Sovereign Control"
            subtitle="Read-only launch view for system parameters, security policies and feature flags"
            loading={loading}
            breadcrumbs={[{ label: 'System Control' }]}
            actions={
                <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => comingSoon('Add Parameter is locked until approval workflow is connected.')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                    ADD PARAMETER
                </Button>
            }
        >
            <LaunchStatusBanner title="Sovereign Control is read-only" message="No unsafe production mutations are allowed from this page until approvals, rollback and Audit Shield logging are live." />

            <Grid container spacing={4}>
                {/* SYSTEM HEALTH CARDS */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>SECURITY STATUS</Typography>
                        <Stack direction="row" spacing={2} sx={{ my: 2 }}>
                            <ShieldCheck size={32} color={binThemeTokens.gold} />
                            <Box>
                                <Typography variant="h5" fontWeight="950" color="#FFF">ACTIVE ENFORCEMENT</Typography>
                                <Typography variant="caption" color="textSecondary">Tier-1 Relational Guard Enabled</Typography>
                            </Box>
                        </Stack>
                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Button fullWidth variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.1)', fontWeight: 900 }}>RUN SECURITY AUDIT</Button>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: '#10b981', fontWeight: 950, letterSpacing: 2 }}>SLA PERFORMANCE</Typography>
                        <Stack direction="row" spacing={2} sx={{ my: 2 }}>
                            <Clock size={32} color="#10b981" />
                            <Box>
                                <Typography variant="h5" fontWeight="950" color="#FFF">PENDING LIVE DATA</Typography>
                                <Typography variant="caption" color="textSecondary">Connect live ticket timestamps first</Typography>
                            </Box>
                        </Stack>
                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Button fullWidth variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.1)', fontWeight: 900 }}>VIEW METRICS</Button>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="overline" sx={{ color: '#6366f1', fontWeight: 950, letterSpacing: 2 }}>KERNEL VERSION</Typography>
                        <Stack direction="row" spacing={2} sx={{ my: 2 }}>
                            <Zap size={32} color="#6366f1" />
                            <Box>
                                <Typography variant="h5" fontWeight="950" color="#FFF">SETUP PROTECTED</Typography>
                                <Typography variant="caption" color="textSecondary">Manual deployment verified by admin</Typography>
                            </Box>
                        </Stack>
                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Button fullWidth variant="outlined" sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.1)', fontWeight: 900 }}>RELEASE NOTES</Button>
                    </Paper>
                </Grid>

                {/* SETTINGS LISTS */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="h6" fontWeight="950" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Sliders size={20} color={binThemeTokens.gold} /> SYSTEM FLAGS
                        </Typography>
                        <List disablePadding>
                            {settings.filter(s => s.category === 'FEATURE_FLAG' || s.category === 'GENERAL').map(s => (
                                <SettingRow key={s.id} setting={s} />
                            ))}
                            {settings.filter(s => s.category === 'FEATURE_FLAG' || s.category === 'GENERAL').length === 0 && (
                                <Typography variant="caption" color="textSecondary">No active feature flags.</Typography>
                            )}
                        </List>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="h6" fontWeight="950" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Shield size={20} color={binThemeTokens.gold} /> SLA & SECURITY POLICIES
                        </Typography>
                        <List disablePadding>
                            {settings.filter(s => s.category === 'SLA' || s.category === 'SECURITY').map(s => (
                                <SettingRow key={s.id} setting={s} />
                            ))}
                            {settings.filter(s => s.category === 'SLA' || s.category === 'SECURITY').length === 0 && (
                                <Typography variant="caption" color="textSecondary">No active security policies.</Typography>
                            )}
                        </List>
                    </Paper>
                </Grid>
            </Grid>
        </AdminPageFrame>
    );
}
