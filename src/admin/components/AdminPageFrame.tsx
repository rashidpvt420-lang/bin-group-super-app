import React from 'react';
import { 
    Box, Typography, Button, Breadcrumbs, Link, 
    CircularProgress, Alert, Chip, alpha, Stack,
    IconButton
} from '@mui/material';
import { 
    ArrowLeft, 
    Home, 
    RefreshCcw as RefreshIcon,
    AlertTriangle,
    Lock,
    Clock
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../theme/adminTheme';

interface AdminPageFrameProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    loading?: boolean;
    error?: string | null;
    isEmpty?: boolean;
    emptyMessage?: string;
    status?: string;
    lastUpdated?: any;
    onRefresh?: () => void;
    permissionDenied?: boolean;
    breadcrumbs?: { label: string; path?: string }[];
    actions?: React.ReactNode;
}

export default function AdminPageFrame({
    title,
    subtitle,
    children,
    loading = false,
    error = null,
    isEmpty = false,
    emptyMessage = "No records found.",
    status,
    lastUpdated,
    onRefresh,
    permissionDenied = false,
    breadcrumbs = [],
    actions
}: AdminPageFrameProps) {
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();

    const safeRender = (val: any): React.ReactNode => {
        if (val === null || val === undefined) return "";
        if (typeof val === 'string' || typeof val === 'number') return val;
        if (val.toDate && typeof val.toDate === 'function') return val.toDate().toLocaleString();
        if (val.seconds !== undefined) return new Date(val.seconds * 1000).toLocaleString();
        if (typeof val === 'object') {
            try { return JSON.stringify(val); } catch(e) { return "[Object]"; }
        }
        return String(val);
    };

    const handleBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/admin/dashboard');
        }
    };

    if (permissionDenied) {
        return (
            <Box sx={{ p: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <Lock size={64} color={binThemeTokens.danger} style={{ marginBottom: 24 }} />
                <Typography variant="h4" fontWeight="950" gutterBottom>PERMISSION DENIED</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.5)', mb: 4, maxWidth: 500 }}>
                    Your administrative credentials do not authorize access to this specific operational node. 
                    Contact the System Administrator for privilege escalation.
                </Typography>
                <Button variant="contained" onClick={() => navigate('/admin/dashboard')}>RETURN TO TERMINAL</Button>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, direction: isRTL ? 'rtl' : 'ltr' }}>
            {/* Header & Navigation */}
            <Box sx={{ mb: 4 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                    <IconButton 
                        onClick={handleBack}
                        sx={{ 
                            bgcolor: 'rgba(255,255,255,0.05)', 
                            color: binThemeTokens.gold,
                            '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1) }
                        }}
                    >
                        <ArrowLeft size={20} />
                    </IconButton>
                    <Breadcrumbs 
                        separator={<Box component="span" sx={{ color: 'rgba(255,255,255,0.2)' }}>/</Box>}
                        sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: '0.75rem' }}
                    >
                        <Link 
                            underline="hover" 
                            color="inherit" 
                            href="/admin/dashboard"
                            onClick={(e) => { e.preventDefault(); navigate('/admin/dashboard'); }}
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                        >
                            <Home size={12} /> ADMIN
                        </Link>
                        {breadcrumbs.map((bc, i) => (
                            <Link 
                                key={i}
                                underline={bc.path ? "hover" : "none"}
                                color={i === breadcrumbs.length - 1 ? "primary" : "inherit"}
                                href={bc.path || "#"}
                                onClick={(e) => { 
                                    if (bc.path) {
                                        e.preventDefault(); 
                                        navigate(bc.path); 
                                    }
                                }}
                            >
                                {String(safeRender(bc.label || '')).toUpperCase()}
                            </Link>
                        ))}
                    </Breadcrumbs>
                </Stack>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="h3" sx={{ fontWeight: 950, letterSpacing: -1 }}>
                                {String(safeRender(title)).toUpperCase()}
                            </Typography>
                            {status && (
                                <Chip 
                                    label={safeRender(status)} 
                                    size="small" 
                                    sx={{ 
                                        bgcolor: alpha(binThemeTokens.gold, 0.1), 
                                        color: binThemeTokens.gold, 
                                        fontWeight: 900,
                                        borderRadius: 1
                                    }} 
                                />
                            )}
                        </Stack>
                        {subtitle && (
                            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600, mt: 0.5 }}>
                                {safeRender(subtitle)}
                            </Typography>
                        )}
                    </Box>

                    <Stack direction="row" spacing={2} alignItems="center">
                        {lastUpdated && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'rgba(255,255,255,0.3)' }}>
                                <Clock size={14} />
                                <Typography variant="caption" fontWeight="700">
                                    SYNCED: {
                                        lastUpdated.toDate ? lastUpdated.toDate().toLocaleTimeString() : 
                                        lastUpdated instanceof Date ? lastUpdated.toLocaleTimeString() : 
                                        typeof lastUpdated === 'string' ? lastUpdated : 'UNKNOWN'
                                    }
                                </Typography>
                            </Box>
                        )}
                        {onRefresh && (
                            <Button 
                                startIcon={<RefreshIcon size={16} />}
                                onClick={onRefresh}
                                disabled={loading}
                                sx={{ 
                                    bgcolor: 'rgba(255,255,255,0.05)', 
                                    color: '#fff',
                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                                    borderRadius: 2
                                }}
                            >
                                {t('dash.sync_btn') || 'REFRESH'}
                            </Button>
                        )}
                        {actions}
                    </Stack>
                </Box>
            </Box>

            {/* Content States */}
            {loading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 12 }}>
                    <CircularProgress sx={{ color: binThemeTokens.gold, mb: 2 }} />
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, letterSpacing: 2, fontWeight: 900 }}>
                        Initializing Sovereign Data Node...
                    </Typography>
                </Box>
            ) : error ? (
                <Alert 
                    severity="error" 
                    variant="outlined" 
                    icon={<AlertTriangle />}
                    sx={{ borderRadius: 3, border: `1px solid ${alpha(binThemeTokens.danger, 0.5)}`, bgcolor: alpha(binThemeTokens.danger, 0.05), color: binThemeTokens.danger }}
                >
                    <Typography fontWeight="900">SYSTEM FAULT</Typography>
                    <Typography variant="body2">{error}</Typography>
                </Alert>
            ) : isEmpty ? (
                <Box sx={{ p: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <Typography variant="h6" fontWeight="800" sx={{ color: 'rgba(255,255,255,0.2)' }}>{emptyMessage.toUpperCase()}</Typography>
                </Box>
            ) : (
                children
            )}
        </Box>
    );
}
