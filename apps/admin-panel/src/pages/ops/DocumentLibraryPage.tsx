import React, { useEffect, useState } from 'react';
import { Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel } from '@mui/material';
import { Plus } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { db, collection, query, onSnapshot, addDoc, serverTimestamp, doc, deleteDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

export default function DocumentLibraryPage() {
    const { t, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [documents, setDocuments] = useState<any[]>([]);
    const [openAdd, setOpenAdd] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form fields
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('policy');
    const [audience, setAudience] = useState('tenant');
    const [propertyId, setPropertyId] = useState('prop_a');
    const [fileUrl, setFileUrl] = useState('');
    const [language, setLanguage] = useState('en');

    useEffect(() => {
        const q = query(collection(db, 'documentLibrary'));
        const unsub = onSnapshot(q, (snap) => {
            setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleCreateDocument = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await addDoc(collection(db, 'documentLibrary'), {
                propertyId,
                title,
                description,
                category,
                audience,
                fileUrl,
                storagePath: `documents/${Date.now()}`,
                language,
                active: true,
                version: '1.0',
                uploadedBy: 'Admin',
                uploadedAt: serverTimestamp()
            });
            setOpenAdd(false);
            setTitle('');
            setDescription('');
            setFileUrl('');
        } catch (err) {
            console.error('Failed to create document:', err);
            alert('Failed to save document record.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteDocument = async (id: string) => {
        if (!window.confirm('Delete document library record?')) return;
        try {
            await deleteDoc(doc(db, 'documentLibrary', id));
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
    }

    return (
        <Container maxWidth="xl" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box>
                    <Typography variant="h4" fontWeight="black" color="#FFF" gutterBottom>Document Library Manager</Typography>
                    <Typography variant="body2" color="text.secondary">Upload and manage building policies, move-in/out checklists, and NOC templates.</Typography>
                </Box>
                <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setOpenAdd(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                    ADD DOCUMENT
                </Button>
            </Box>

            <Grid container spacing={4}>
                <Grid item xs={12}>
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, bgcolor: 'rgba(255,255,255,0.01)' }}>
                        <Table sx={{ minWidth: 650, '& .MuiTableCell-root': { borderColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' } }}>
                            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                <TableRow sx={{ '& th': { color: '#FFF', fontWeight: 'bold' } }}>
                                    <TableCell>Title</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Target Audience</TableCell>
                                    <TableCell>Property ID</TableCell>
                                    <TableCell>Language</TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {documents.map((docItem) => (
                                    <TableRow key={docItem.id} hover>
                                        <TableCell sx={{ fontWeight: 'bold', color: '#FFF' }}>{docItem.title}</TableCell>
                                        <TableCell>{docItem.category?.toUpperCase()}</TableCell>
                                        <TableCell>
                                            <Chip label={docItem.audience?.toUpperCase()} size="small" />
                                        </TableCell>
                                        <TableCell>{docItem.propertyId}</TableCell>
                                        <TableCell>{docItem.language?.toUpperCase()}</TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                {docItem.fileUrl && <Button size="small" component="a" href={docItem.fileUrl} target="_blank">VIEW</Button>}
                                                <Button size="small" color="error" onClick={() => handleDeleteDocument(docItem.id)}>DELETE</Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {documents.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                                            <Typography color="textSecondary">No documents found in library.</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>

            {/* Add Document Dialog */}
            <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#0b0f19', color: '#FFF', borderRadius: 4 } }}>
                <form onSubmit={handleCreateDocument}>
                    <DialogTitle sx={{ fontWeight: 'bold' }}>Add Library Document</DialogTitle>
                    <DialogContent>
                        <Stack spacing={3} sx={{ mt: 2, minWidth: 320 }}>
                            <TextField fullWidth label="Document Title" required value={title} onChange={e => setTitle(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Description" value={description} onChange={e => setDescription(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <TextField fullWidth label="Document File URL" required value={fileUrl} onChange={e => setFileUrl(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <FormControl fullWidth variant="filled">
                                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Category</InputLabel>
                                        <Select value={category} onChange={e => setCategory(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                            <MenuItem value="policy">Policy</MenuItem>
                                            <MenuItem value="form">Form / Template</MenuItem>
                                            <MenuItem value="emergency">Emergency Info</MenuItem>
                                            <MenuItem value="rules">Building Rules</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={6}>
                                    <FormControl fullWidth variant="filled">
                                        <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Language</InputLabel>
                                        <Select value={language} onChange={e => setLanguage(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                            <MenuItem value="en">English</MenuItem>
                                            <MenuItem value="ar">Arabic</MenuItem>
                                            <MenuItem value="both">Bilingual (EN/AR)</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                            </Grid>
                            <TextField fullWidth label="Property ID" required value={propertyId} onChange={e => setPropertyId(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' } }} />
                            <FormControl fullWidth variant="filled">
                                <InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Audience Scope</InputLabel>
                                <Select value={audience} onChange={e => setAudience(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF' }}>
                                    <MenuItem value="tenant">Tenants Only</MenuItem>
                                    <MenuItem value="owner">Owners Only</MenuItem>
                                    <MenuItem value="technician">Technicians Only</MenuItem>
                                    <MenuItem value="all">All</MenuItem>
                                </Select>
                            </FormControl>
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                        <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 'bold' }}>
                            {submitting ? <CircularProgress size={20} color="inherit" /> : 'ADD'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Container>
    );
}
