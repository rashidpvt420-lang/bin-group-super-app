import React, { useState, useEffect } from 'react';
import { 
    Grid, Typography, Box, Paper, Button, 
    Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    alpha, Stack, IconButton, TextField, InputAdornment
} from '@mui/material';
import { 
    Landmark, Download, ShieldCheck, Eye, Trash2, Clock, FileText,
    Search, Filter, Folder, Share2
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

interface VaultDocument {
    id: string;
    name: string;
    category: string;
    expiryDate?: any;
    status: 'verified' | 'pending' | 'expired';
    fileUrl: string;
    uploadedAt: any;
}

export default function InstitutionalDocumentVaultPage() {
    const { t } = useLanguage();
    const [documents, setDocuments] = useState<VaultDocument[]>([]);
    const [filteredDocs, setFilteredDocs] = useState<VaultDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('ALL');

    const categories = ['ALL', 'LEGAL', 'FINANCIAL', 'TECHNICAL', 'COMPLIANCE', 'ASSET'];

    useEffect(() => {
        const q = query(collection(db, 'vault'), orderBy('uploadedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as VaultDocument[];
            setDocuments(fetched);
            setFilteredDocs(fetched);
            setLoading(false);
        }, (error) => {
            console.error("Vault Fetch Error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        let docs = documents;
        if (activeCategory !== 'ALL') {
            docs = docs.filter(d => d.category?.toUpperCase() === activeCategory);
        }
        if (search) {
            docs = docs.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
        }
        setFilteredDocs(docs);
    }, [search, activeCategory, documents]);

    const handleDownload = (url: string) => {
        window.open(url, '_blank');
    };

    return (
        <AdminPageFrame
            title="Institutional Vault"
            subtitle="Secure repository for sovereign documentation and compliance evidence"
            loading={loading}
            isEmpty={documents.length === 0}
            emptyMessage="VAULT IS EMPTY - SECURE BUNDLES REQUIRED"
            breadcrumbs={[{ label: 'Document Vault' }]}
        >
            <Stack spacing={4}>
                {/* CONTROL BAR */}
                <Paper sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={4}>
                            <TextField 
                                fullWidth
                                size="small"
                                placeholder="Search Vault Documents..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <Search size={18} color="rgba(255,255,255,0.3)" />
                                        </InputAdornment>
                                    ),
                                    sx: { borderRadius: 3, bgcolor: '#000', border: '1px solid rgba(255,255,255,0.05)' }
                                }}
                            />
                        </Grid>
                        <Grid item xs={12} md={8}>
                            <Stack direction="row" spacing={1} overflow="auto">
                                {categories.map(cat => (
                                    <Chip 
                                        key={cat}
                                        label={cat}
                                        onClick={() => setActiveCategory(cat)}
                                        sx={{ 
                                            borderRadius: 2,
                                            fontWeight: 900,
                                            fontSize: '0.65rem',
                                            bgcolor: activeCategory === cat ? binThemeTokens.gold : 'rgba(255,255,255,0.05)',
                                            color: activeCategory === cat ? '#000' : '#FFF',
                                            '&:hover': { bgcolor: activeCategory === cat ? binThemeTokens.gold : 'rgba(255,255,255,0.1)' }
                                        }}
                                    />
                                ))}
                            </Stack>
                        </Grid>
                    </Grid>
                </Paper>

                {/* DOCUMENT GRID */}
                <Grid container spacing={3}>
                    {filteredDocs.map((doc) => (
                        <Grid item xs={12} sm={6} md={4} lg={3} key={doc.id}>
                            <Paper sx={{ 
                                p: 3, 
                                borderRadius: 5, 
                                bgcolor: 'rgba(255,255,255,0.01)', 
                                border: '1px solid rgba(255,255,255,0.05)',
                                transition: 'transform 0.2s ease',
                                '&:hover': { transform: 'translateY(-4px)', borderColor: alpha(binThemeTokens.gold, 0.3) }
                            }}>
                                <Stack spacing={2}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                        <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}>
                                            <FileText size={24} color={binThemeTokens.gold} />
                                        </Box>
                                        <Chip 
                                            label={String(doc.status || 'PENDING').toUpperCase()} 
                                            size="small" 
                                            sx={{ 
                                                fontSize: '0.6rem', 
                                                fontWeight: 950,
                                                bgcolor: doc.status === 'verified' ? alpha('#10b981', 0.1) : alpha('#f59e0b', 0.1),
                                                color: doc.status === 'verified' ? '#10b981' : '#f59e0b'
                                            }} 
                                        />
                                    </Stack>
                                    
                                    <Box>
                                        <Typography variant="body1" fontWeight="950" noWrap color="#FFF">
                                            {String(doc.name || 'UNNAMED DOCUMENT').toUpperCase()}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                                            {doc.category || 'GENERAL'} • {doc.uploadedAt?.toDate ? doc.uploadedAt.toDate().toLocaleDateString() : 'LEGACY'}
                                        </Typography>
                                    </Box>

                                    <Box sx={{ pt: 1, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                            <IconButton size="small" onClick={() => handleDownload(doc.fileUrl)}>
                                                <Download size={16} color={binThemeTokens.gold} />
                                            </IconButton>
                                            <IconButton size="small">
                                                <Share2 size={16} color="rgba(255,255,255,0.3)" />
                                            </IconButton>
                                            <IconButton size="small">
                                                <MoreHorizontal size={16} color="rgba(255,255,255,0.3)" />
                                            </IconButton>
                                        </Stack>
                                    </Box>
                                </Stack>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>

                {/* BOTTOM COMPLIANCE CARDS */}
                <Grid container spacing={4}>
                    <Grid item xs={12} md={6}>
                        <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <ShieldCheck color={binThemeTokens.gold} /> AUDIT SHIELD INTEGRATION
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>
                                Every document in the Institutional Vault is cryptographically hashed and logged in the Sovereign Audit Shield for forensic verification.
                            </Typography>
                            <Button variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                RUN INTEGRITY CHECK
                            </Button>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <Paper sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Landmark color={binThemeTokens.gold} /> PORTAL CONNECTIVITY
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>
                                Syncing with UAE Federal and Municipal portals (DLD, Ejari, DEWA).
                            </Typography>
                            <Stack direction="row" spacing={2}>
                                <Chip label="DLD: CONNECTED" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 950 }} />
                                <Chip label="EJARI: SYNCED" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 950 }} />
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>
            </Stack>
        </AdminPageFrame>
    );
}
