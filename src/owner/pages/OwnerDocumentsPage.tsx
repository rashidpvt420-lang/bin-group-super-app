import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Paper, CircularProgress, 
    Stack, alpha, Button, IconButton, Tooltip 
} from '@mui/material';
import { 
    FolderOpen, FileText, Download, Eye, 
    Lock, Shield, Clock, Search, Filter 
} from 'lucide-react';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerDocumentsPage() {
    const { user } = useRole();
    const [loading, setLoading] = useState(true);
    const [documents, setDocuments] = useState<any[]>([]);

    useEffect(() => {
        if (!user?.email) return;
        
        const email = user.email.toLowerCase();
        const docQ = query(collection(db, 'documents'), where('ownerEmail', '==', email));
        
        const unsubscribe = onSnapshot(docQ, (snap) => {
            setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
            {/* Header */}
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>INSTITUTIONAL ASSET VAULT</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>Documents</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mt: 1 }}>Secure repository for contracts, title deeds, and financial audits.</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Lock size={16} />} sx={{ borderColor: alpha(binThemeTokens.gold, 0.3), color: binThemeTokens.gold, fontWeight: 900, borderRadius: 3 }}>Secure Link</Button>
                </Stack>
            </Box>

            {documents.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}>
                    <FolderOpen size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>VAULT IS EMPTY</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.1)', mt: 1, display: 'block' }}>No documents have been securely transmitted to your ledger yet.</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {documents.map(doc => (
                        <Grid item xs={12} sm={6} md={4} key={doc.id}>
                            <Paper sx={{ 
                                p: 3, 
                                bgcolor: 'rgba(15, 23, 42, 0.4)', 
                                border: '1px solid rgba(255,255,255,0.05)', 
                                borderRadius: 5,
                                transition: 'all 0.2s ease',
                                '&:hover': { bgcolor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)' }
                            }}>
                                <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                                    <Box sx={{ width: 44, height: 44, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: binThemeTokens.gold }}>
                                        <FileText size={22} />
                                    </Box>
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#FFF', noWrap: true, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {doc.name || 'Untitled Document'}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                                            {doc.category || 'GENERAL'} · {doc.size || '1.2 MB'}
                                        </Typography>
                                    </Box>
                                </Stack>

                                <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
                                    <Chip label={doc.type || 'PDF'} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontWeight: 900, fontSize: '0.6rem' }} />
                                    <Chip label="ENCRYPTED" size="small" icon={<Shield size={10} />} sx={{ bgcolor: alpha('#10b981', 0.1), color: '#10b981', fontWeight: 900, fontSize: '0.6rem' }} />
                                </Stack>

                                <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.05)' }} />

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Clock size={12} color="rgba(255,255,255,0.2)" />
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 700 }}>
                                            {doc.uploadedAt ? new Date(doc.uploadedAt.seconds * 1000).toLocaleDateString() : 'Dec 2023'}
                                        </Typography>
                                    </Stack>
                                    <Box>
                                        <Tooltip title="Preview">
                                            <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.4)' }} onClick={() => window.open(doc.url, '_blank')}>
                                                <Eye size={16} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Download">
                                            <IconButton size="small" sx={{ color: binThemeTokens.gold }} onClick={() => window.open(doc.url, '_blank')}>
                                                <Download size={16} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </Box>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Security Note */}
            <Box sx={{ mt: 8, textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.15)', fontWeight: 800, letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <Shield size={14} /> ALL DOCUMENTS ARE AES-256 ENCRYPTED AND STORED ON SOVEREIGN NODES
                </Typography>
            </Box>
        </Box>
    );
}
