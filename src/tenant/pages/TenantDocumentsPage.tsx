import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Stack, Button, CircularProgress } from '@mui/material';
import { db, collection, query, where, getDocs } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { FileText, Download, FileCheck, Info } from 'lucide-react';

export default function TenantDocumentsPage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [documents, setDocuments] = useState<any[]>([]);

    useEffect(() => {
        const fetchDocuments = async () => {
            if (!user?.uid) return;
            try {
                // Fetch notices meant for all tenants or specifically this tenant
                const q = query(
                    collection(db, 'tenantDocuments'),
                    where('visibility', 'in', ['tenant_all', 'tenant_specific']),
                    where('tenantId', 'in', ['ALL', user.uid])
                );
                const snap = await getDocs(q);
                
                // For simplicity in Phase 5, we'll populate some system notices if empty
                if (snap.empty) {
                    setDocuments([
                        { id: '1', title: 'Community Guidelines 2026', type: 'NOTICE', date: new Date().toISOString() },
                        { id: '2', title: 'Emergency Protocols', type: 'GUIDE', date: new Date().toISOString() }
                    ]);
                } else {
                    setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                }
            } catch (err) {
                console.error("Docs fetch failed:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchDocuments();
    }, [user]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Box>
            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 4 }}>Documents & Notices</Typography>

            <Grid container spacing={3}>
                {documents.map(doc => (
                    <Grid item xs={12} md={6} key={doc.id}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Stack direction="row" spacing={2} alignItems="center">
                                <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                                    {doc.type === 'NOTICE' ? <Info size={24} color={binThemeTokens.gold} /> : <FileText size={24} color={binThemeTokens.gold} />}
                                </Box>
                                <Box>
                                    <Typography variant="body1" fontWeight="900" color="#FFF">{doc.title}</Typography>
                                    <Typography variant="caption" color="textSecondary">Added: {new Date(doc.date || doc.createdAt).toLocaleDateString()}</Typography>
                                </Box>
                            </Stack>
                            <Button variant="outlined" size="small" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>
                                VIEW
                            </Button>
                        </Paper>
                    </Grid>
                ))}
            </Grid>
            {documents.length === 0 && (
                <Typography variant="body1" color="textSecondary" align="center" sx={{ py: 10 }}>
                    No documents available.
                </Typography>
            )}
        </Box>
    );
}
