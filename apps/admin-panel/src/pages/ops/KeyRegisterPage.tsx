import React, { useEffect, useState } from 'react';
import { Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { Plus } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { db, collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

export default function KeyRegisterPage() {
    const { t, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [keys, setKeys] = useState<any[]>([]);
    const [movements, setMovements] = useState<any[]>([]);
    const [openAdd, setOpenAdd] = useState(false);
    const [openIssue, setOpenIssue] = useState(false);
    const [selectedKey, setSelectedKey] = useState<any>(null);
    const [submitting, setSubmitting] = useState(false);

    // Key creation fields
    const [keyCodeMasked, setKeyCodeMasked] = useState('');
    const [keyType, setKeyType] = useState('master');
    const [unitId, setUnitId] = useState('unit_a');
    const [propertyId, setPropertyId] = useState('prop_a');

    // Key movement fields
    const [toCustodian, setToCustodian] = useState('');
    const [custodianType, setCustodianType] = useState('staff');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        const unsubKeys = onSnapshot(collection(db, 'keyRegister'), (snap) => {
            setKeys(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        const unsubMove = onSnapshot(collection(db, 'keyMovements'), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setMovements(list);
        });

        return () => {
            unsubKeys();
            unsubMove();
        };
    }, []);

    const handleCreateKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'keyRegister'), {
                propertyId,
                unitId,
                keyType,
                keyCodeMasked,
                status: 'available',
                currentCustodianType: 'security',
                currentCustodianName: 'Front Gate Desk',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            setOpenAdd(false);
            setKeyCodeMasked('');
        } catch (err) {
            console.error('Failed to create key:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleIssueKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedKey) return;
        setSubmitting(true);
        try {
            // Update key register
            await updateDoc(doc(db, 'keyRegister', selectedKey.id), {
                status: 'issued',
                currentCustodianType: custodianType,
                currentCustodianName: toCustodian,
                updatedAt: serverTimestamp()
            });

            // Log movement
            await addDoc(collection(db, 'keyMovements'), {
                propertyId: selectedKey.propertyId,
                unitId: selectedKey.unitId,
                keyId: selectedKey.id,
                action: 'issued',
                fromCustodian: selectedKey.currentCustodianName || 'Security',
                toCustodian,
                handledBy: 'Admin Operator',
                signatureRequired: true,
                notes,
                createdAt: serverTimestamp()
            });

            setOpenIssue(false);
            setToCustodian('');
            setNotes('');
        } catch (err) {
            console.error('Failed to issue key:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleReturnKey = async (keyItem: any) => {
        try {
            await updateDoc(doc(db, 'keyRegister', keyItem.id), {
                status: 'available',
                currentCustodianType: 'security',
                currentCustodianName: 'Front Gate Desk',
                updatedAt: serverTimestamp()
            });

            await addDoc(collection(db, 'keyMovements'), {
                propertyId: keyItem.propertyId,
                unitId: keyItem.unitId,
                keyId: keyItem.id,
                action: 'returned',
                fromCustodian: keyItem.currentCustodianName,
                toCustodian: 'Front Gate Desk',
                handledBy: 'Admin Operator',
                createdAt: serverTimestamp()
            });
        } catch (err) {
            console.error('Failed to return key:', err);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    }

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box>
                    <Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>Key Register & Custody</Typography>
                    <Typography variant="body2" color="text.secondary">Register unit keys and log custodian sign-in/out activities.</Typography>
                </Box>
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                    REGISTER KEY
                </Button>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={6}>
                    <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
                        <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold', mb: 3 }}>Keys Register</Typography>
                        <TableContainer>
                            <Table sx={{ '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}>
                                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableRow sx={{ '& th': { color: '#FFF', fontWeight: 'bold' } }}>
                                        <TableCell>Unit / Type</TableCell>
                                        <TableCell>Custodian</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {keys.map((k) => (
                                        <TableRow key={k.id} hover>
                                            <TableCell>
                                                <Typography variant="subtitle2" color="#FFF" fontWeight="bold">{k.unitId}</Typography>
                                                <Typography variant="caption" color="textSecondary">{k.keyType?.toUpperCase()} · {k.keyCodeMasked}</Typography>
                                            </TableCell>
                                            <TableCell>{k.currentCustodianName} ({k.currentCustodianType})</TableCell>
                                            <TableCell>
                                                <Chip label={(k.status || 'available').toUpperCase()} size="small" color={k.status === 'available' ? 'success' : 'warning'} />
                                            </TableCell>
                                            <TableCell align="right">
                                                {k.status === 'available' ? (
                                                    <Button size="small" variant="outlined" onClick={() => { setSelectedKey(k); setOpenIssue(true); }}>ISSUE</Button>
                                                ) : (
                                                    <Button size="small" color="success" onClick={() => handleReturnKey(k)}>RETURN</Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={6}>
                    <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
                        <Typography variant="h6" color="#FFF" sx={{ fontWeight: 'bold', mb: 3 }}>Recent Movement logs</Typography>
                        <TableContainer sx={{ maxHeight: 500 }}>
                            <Table sx={{ '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}>
                                <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableRow sx={{ '& th': { color: '#FFF', fontWeight: 'bold' } }}>
                                        <TableCell>Key / Unit</TableCell>
                                        <TableCell>Movement</TableCell>
                                        <TableCell>Custodian / Handler</TableCell>
                                        <TableCell>Time</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {movements.map((m) => (
                                        <TableRow key={m.id}>
                                            <TableCell>{m.unitId}</TableCell>
                                            <TableCell>
                                                <Chip label={m.action?.toUpperCase()} size="small" color={m.action === 'returned' ? 'success' : 'primary'} />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="#FFF">{m.toCustodian}</Typography>
                                                <Typography variant="caption" color="textSecondary">By {m.handledBy}</Typography>
                                            </TableCell>
                                            <TableCell>{m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString() : ''}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
            </Grid>

            {/* Register Key Dialog */}
            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
                <form onSubmit={handleCreateKey}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Register Key File</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2, minWidth: 320 }}>
                            <TextField fullWidth label="Key Code Masked (e.g. KEY-A-12)" required value={keyCodeMasked} onChange={e => setKeyCodeMasked(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <FormControl fullWidth variant="filled">
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Key Type</InputLabel>
                                <Select value={keyType} onChange={e => setKeyType(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                    <MenuItem value="master">Building Master</MenuItem>
                                    <MenuItem value="unit">Unit Entrance</MenuItem>
                                    <MenuItem value="mailbox">Mailbox</MenuItem>
                                    <MenuItem value="parking">Parking Gate Barrier</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField fullWidth label="Unit ID" required value={unitId} onChange={e => setUnitId(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Property ID" required value={propertyId} onChange={e => setPropertyId(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                            {submitting ? <CircularProgress size={20} color="inherit" /> : 'REGISTER'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            {/* Issue Key Dialog */}
            <Dialog open={openIssue} onClose={() => setOpenIssue(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
                <form onSubmit={handleIssueKey}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Issue Key Custody</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2, minWidth: 320 }}>
                            <TextField fullWidth label="Custodian Full Name" required value={toCustodian} onChange={e => setToCustodian(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <FormControl fullWidth variant="filled">
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Custodian Type</InputLabel>
                                <Select value={custodianType} onChange={e => setCustodianType(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                    <MenuItem value="tenant">Resident / Tenant</MenuItem>
                                    <MenuItem value="staff">Building Operations Staff</MenuItem>
                                    <MenuItem value="contractor">Third-party Contractor</MenuItem>
                                    <MenuItem value="security">Security Patrol</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField fullWidth label="Notes / Reason" multiline rows={2} value={notes} onChange={e => setNotes(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenIssue(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                            {submitting ? <CircularProgress size={20} color="inherit" /> : 'CONFIRM ISSUE'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}
