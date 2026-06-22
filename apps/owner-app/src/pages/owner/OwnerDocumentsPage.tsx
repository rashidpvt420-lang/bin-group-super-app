import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Paper, Grid, Stack, Button, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControl, InputLabel, Select } from '@mui/material';
import { FileText, Download, Plus, Search } from 'lucide-react';
import { db, collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, orderBy } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerDocumentsPage() {
    const { user } = useRole();
    const { t, tx, isRTL } = useLanguage();
    const [properties, setProperties] = useState<any[]>([]);
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form inputs
    const [targetProperty, setTargetProperty] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('tenancy');
    const [audience, setAudience] = useState('tenant');
    const [fileUrl, setFileUrl] = useState('');
    const [language, setLanguage] = useState('en');

    useEffect(() => {
        if (!user?.uid) return;

        const fetchData = async () => {
            try {
                // Get owner property ids
                const qProp = query(collection(db, 'properties'), where('ownerId', '==', user.uid));
                const snapProp = await getDocs(qProp);
                const props = snapProp.docs.map(d => ({ id: d.id, ...d.data() }));
                setProperties(props);
                if (props.length > 0) {
                    setTargetProperty(props[0].id);
                }

                // If owner owns properties, listen to documents matching those properties
                const propIds = props.map(p => p.id);
                if (propIds.length > 0) {
                    const qDocs = query(
                        collection(db, 'documentLibrary'),
                        where('propertyId', 'in', propIds)
                    );
                    const unsubscribe = onSnapshot(qDocs, (snap) => {
                        setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                        setLoading(false);
                    }, (err) => {
                        console.error(err);
                        setLoading(false);
                    });
                    return () => unsubscribe();
                } else {
                    setLoading(false);
                }
            } catch (err) {
                console.error(err);
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    const handleCreateDocument = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetProperty || !title || !fileUrl) return;
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'documentLibrary'), {
                propertyId: targetProperty,
                title,
                description,
                category,
                audience,
                fileUrl,
                storagePath: 'manual-link',
                language,
                active: true,
                version: '1.0',
                uploadedBy: user?.uid,
                uploadedAt: serverTimestamp()
            });

            setOpenAdd(false);
            setTitle('');
            setDescription('');
            setFileUrl('');
        } catch (err) {
            console.error("Document upload details entry failed:", err);
            alert("Error logging document entry.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                        {tx('docs.vault_subtitle', 'SECURE DIGITAL VAULT')}
                    </Typography>
                    <Typography variant="h3" fontWeight="950" color="#FFF">
                        {tx('docs.title', 'Documents & Forms Library')}
                    </Typography>
                    <Typography variant="body1" color="rgba(255,255,255,0.5)">
                        {tx('docs.desc', 'Access and manage tenancy agreements, NOC forms, building guidelines, and rules.')}
                    </Typography>
                </Box>
                {properties.length > 0 && (
                    <Button
                        variant="contained"
                        startIcon={<Plus size={18} />}
                        onClick={() => setOpenAdd(true)}
                        sx={{
                            background: binThemeTokens.goldGradient,
                            color: '#000',
                            fontWeight: 'bold',
                            px: 4, py: 2
                        }}
                    >
                        {tx('docs.btn_upload', 'LOG NEW DOCUMENT')}
                    </Button>
                )}
            </Box>

            {properties.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <FileText size={48} color={binThemeTokens.gold} style={{ marginBottom: 16 }} />
                    <Typography variant="h5" color="#FFF" gutterBottom>No properties linked.</Typography>
                    <Typography variant="body2" color="textSecondary">Onboard a property to manage tenancy documents.</Typography>
                </Paper>
            ) : (
                <Grid container spacing={4}>
                    <Grid item xs={12}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="bold" color="#FFF" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <FileText size={20} color={binThemeTokens.gold} />
                                {tx('docs.registered_files', 'Document Library Directory')}
                            </Typography>
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow sx={{ '& th': { color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' } }}>
                                            <TableCell>{tx('docs.col_title', 'Document Info')}</TableCell>
                                            <TableCell>{tx('docs.col_category', 'Category')}</TableCell>
                                            <TableCell>{tx('docs.col_audience', 'Audience')}</TableCell>
                                            <TableCell>{tx('docs.col_language', 'Language')}</TableCell>
                                            <TableCell align="right">{tx('docs.col_action', 'Download')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {documents.map((docItem) => (
                                            <TableRow key={docItem.id}>
                                                <TableCell sx={{ color: '#FFF' }}>
                                                    <Typography variant="subtitle2" fontWeight="bold">{docItem.title}</Typography>
                                                    <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>{docItem.description || 'No description provided.'}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip label={docItem.category?.toUpperCase()} size="small" variant="outlined" sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold }} />
                                                </TableCell>
                                                <TableCell>
                                                    <Chip label={docItem.audience?.toUpperCase()} size="small" />
                                                </TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                                    {docItem.language?.toUpperCase() || 'EN'}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Button
                                                        variant="text"
                                                        startIcon={<Download size={14} />}
                                                        href={docItem.fileUrl}
                                                        target="_blank"
                                                        sx={{ color: binThemeTokens.gold }}
                                                    >
                                                        GET FILE
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {documents.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                                                    <Typography color="textSecondary">No documents registered for your properties yet.</Typography>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                </Grid>
            )}

            {/* Log Document Dialog */}
            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4, minWidth: 400 } }}>
                <form onSubmit={handleCreateDocument}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Register Property Document</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2 }}>
                            <FormControl fullWidth variant="filled">
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Target Property</InputLabel>
                                <Select value={targetProperty} onChange={e => setTargetProperty(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                    {properties.map(p => (
                                        <MenuItem key={p.id} value={p.id}>{p.area} • {p.buildingName || p.emirate}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField fullWidth label="Document Title" required value={title} onChange={e => setTitle(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Description" multiline rows={2} value={description} onChange={e => setDescription(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Document URL Link" required placeholder="https://" value={fileUrl} onChange={e => setFileUrl(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <FormControl fullWidth variant="filled">
                                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Category</InputLabel>
                                        <Select value={category} onChange={e => setCategory(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                            <MenuItem value="tenancy">Tenancy Agreement</MenuItem>
                                            <MenuItem value="noc">NOC Template</MenuItem>
                                            <MenuItem value="rules">Building Rules</MenuItem>
                                            <MenuItem value="move_in">Move-in Form</MenuItem>
                                            <MenuItem value="move_out">Move-out Form</MenuItem>
                                            <MenuItem value="policy">Building Policy</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={3}>
                                    <FormControl fullWidth variant="filled">
                                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Audience</InputLabel>
                                        <Select value={audience} onChange={e => setAudience(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                            <MenuItem value="all">All</MenuItem>
                                            <MenuItem value="tenant">Tenant</MenuItem>
                                            <MenuItem value="owner">Owner</MenuItem>
                                            <MenuItem value="admin">Admin</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={3}>
                                    <FormControl fullWidth variant="filled">
                                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Lang</InputLabel>
                                        <Select value={language} onChange={e => setLanguage(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                            <MenuItem value="en">EN</MenuItem>
                                            <MenuItem value="ar">AR</MenuItem>
                                            <MenuItem value="both">Both</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                            </Grid>
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
        </Container>
    );
}
