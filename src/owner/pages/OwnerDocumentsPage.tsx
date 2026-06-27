import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Paper, CircularProgress, 
    Stack, alpha, Button, IconButton, Tooltip, Chip, Divider
} from '@mui/material';
import { 
    FolderOpen, FileText, Download, Eye, 
    Lock, Shield, Clock 
} from 'lucide-react';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

import DocumentCenterCard from '../../components/DocumentCenterCard';

export default function OwnerDocumentsPage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [documents, setDocuments] = useState<any[]>([]);

    useEffect(() => {
        if (!user?.email) {
            setLoading(false);
            return;
        }
        
        const email = user.email.toLowerCase();
        const docQ = query(collection(db, 'documents'), where('ownerEmail', '==', email));
        
        const unsubscribe = onSnapshot(docQ, (snap) => {
            setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (error) => {
            console.error('[OwnerDocuments] vault listener failed:', error);
            setDocuments([]);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.email]);

    if (loading) return (
        <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>Decrypting Vault...</Typography>
        </Box>
    );

    return (
        <Box sx={{ pb: 6 }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>INSTITUTIONAL ASSET VAULT</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>Documents</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1 }}>Secure repository for contracts, title deeds, invoices, receipts, service reports, and financial audits.</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Lock size={16} />} sx={{ borderColor: alpha(binThemeTokens.gold, 0.3), color: binThemeTokens.gold, fontWeight: 900, borderRadius: 3 }}>Secure Link</Button>
                </Stack>
            </Box>

            {documents.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}>
                    <FolderOpen size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>VAULT IS EMPTY</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.1)', mt: 1, display: 'block' }}>No downloadable documents have been securely transmitted to your ledger yet.</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {documents.map(doc => (
                        <Grid item xs={12} sm={6} md={4} key={doc.id}>
                            <DocumentCenterCard doc={doc} themeColor={binThemeTokens.gold} />
                        </Grid>
                    ))}
                </Grid>
            )}

            <Box sx={{ mt: 8, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.15)', fontWeight: 800, letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Shield size={14} /> ALL DOCUMENTS ARE ACCESS-CONTROLLED AND STORED IN BIN GROUP SECURE VAULT
                </Typography>
            </Box>
        </Box>
    );
}
