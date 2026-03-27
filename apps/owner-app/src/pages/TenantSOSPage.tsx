// apps/owner-app/src/pages/TenantSOSPage.tsx
import React, { useState } from 'react';
import { 
    Container, Typography, Box, TextField, Button, 
    Paper, Grid, MenuItem, Select, InputLabel, FormControl, 
    Stack, Alert, CircularProgress, Chip, Divider
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Home, Camera, ShieldAlert, Send, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { db, collection, addDoc, serverTimestamp } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';

export default function TenantSOSPage() {
    const navigate = useNavigate();
    const { user } = useRole();
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!category || !description || !user) return;

        setSubmitting(true);
        try {
            await addDoc(collection(db, 'tickets'), {
                tenantId: user.uid,
                trade: category.toUpperCase(),
                description,
                hasImage: !!image,
                status: 'OPEN',
                priority: (category === 'ac_failure' || category === 'plumbing' || category === 'electrical') ? 'EMERGENCY' : 'MEDIUM',
                propertyId: 'PILOT_DUB_01',
                createdAt: serverTimestamp()
            });
            setSubmitted(true);
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <Container maxWidth="sm" sx={{ py: 12, textAlign: 'center' }}>
                <Paper sx={{ p: 8, bgcolor: 'rgba(76, 175, 80, 0.05)', border: '1px solid #4CAF50', borderRadius: 10 }}>
                    <CheckCircle2 color="#4CAF50" size={64} />
                    <Typography variant="h3" fontWeight="900" sx={{ color: '#4CAF50', mt: 4, mb: 2, letterSpacing: -1 }}>DISPATCH TRIGGERED</Typography>
                    <Typography variant="h6" sx={{ color: binThemeTokens.textSecondary, mb: 6 }}>
                        Sovereign response team notified. A verified technician will arrive within **4 HOURS** (SLA Protocol Alpha).
                    </Typography>
                    <Button variant="contained" fullWidth size="large" onClick={() => navigate('/dashboard')} sx={{ bgcolor: '#4CAF50', color: '#FFF', fontWeight: 900, py: 2 }}>RETURN TO DASHBOARD</Button>
                </Paper>
            </Container>
        );
    }

    return (
        <Container maxWidth="sm" sx={{ py: { xs: 3, md: 6 } }}>
            {/* Background Emergency Pulse */}
            <Box sx={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 800, height: 800, background: 'radial-gradient(circle, rgba(220, 38, 38, 0.03) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

            <Box sx={{ mb: 6, position: 'relative', zIndex: 1 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                    <ShieldAlert color="#DC2626" size={24} />
                    <Typography variant="overline" sx={{ color: '#DC2626', fontWeight: 900, letterSpacing: 3 }}>EMERGENCY PROTOCOL</Typography>
                </Stack>
                <Typography variant="h3" fontWeight="900" sx={{ color: '#FFFFFF', letterSpacing: -1, mb: 1 }}>SOS Dispatch</Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary }}>Report critical infrastructure failures for immediate institutional restoration.</Typography>
            </Box>

            <Paper elevation={0} sx={{ p: { xs: 4, md: 6 }, borderRadius: 8, bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(220, 38, 38, 0.2)', boxShadow: '0 40px 100px rgba(0,0,0,0.5)', position: 'relative', zIndex: 1 }}>
                <form onSubmit={handleSubmit}>
                    <Stack spacing={4}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>FAULT CATEGORY</InputLabel>
                            <Select 
                                value={category} 
                                label="FAULT CATEGORY" 
                                title="FAULT CATEGORY"
                                inputProps={{ title: "FAULT CATEGORY" }}
                                onChange={(e) => setCategory(e.target.value)}
                                required
                                sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)', color: '#FFFFFF' }}
                            >
                                <MenuItem value="ac_failure">AC / HVAC CRITICAL FAILURE</MenuItem>
                                <MenuItem value="plumbing">MAJOR PLUMBING / FLOODING</MenuItem>
                                <MenuItem value="electrical">ELECTRICAL SHORT / BLACKOUT</MenuItem>
                                <MenuItem value="security">SECURITY / ACCESS BREACH</MenuItem>
                            </Select>
                        </FormControl>

                        <TextField 
                            fullWidth 
                            multiline 
                            rows={4} 
                            label="MISSION DESCRIPTION" 
                            title="MISSION DESCRIPTION"
                            placeholder="Provide unit details and fault specifics..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)' } }}
                        />

                        <Button 
                            variant="outlined" 
                            component="label" 
                            startIcon={<Camera size={20} />}
                            fullWidth
                            sx={{ py: 2, borderRadius: 4, borderColor: 'rgba(198,167,94,0.2)', color: binThemeTokens.gold, fontWeight: 900, '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198,167,94,0.05)' } }}
                        >
                            {image ? image.name : 'ATTACH VISUAL EVIDENCE'}
                            <input hidden accept="image/*" type="file" onChange={e => setImage(e.target.files?.[0] || null)} />
                        </Button>

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Button 
                            type="submit" 
                            variant="contained" 
                            size="large" 
                            fullWidth 
                            disabled={submitting}
                            sx={{ bgcolor: '#DC2626', color: '#FFFFFF', py: 2.5, fontWeight: 900, borderRadius: 4, boxShadow: '0 10px 30px rgba(220, 38, 38, 0.3)', '&:hover': { bgcolor: '#B91C1C' }, '&.Mui-disabled': { bgcolor: 'rgba(220, 38, 38, 0.1)', color: 'rgba(255,255,255,0.2)' } }}
                        >
                            {submitting ? <CircularProgress size={24} color="inherit" /> : <><Send size={20} style={{ marginRight: 8 }} /> TRIGGER DISPATCH</>}
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </Container>
    );
}
