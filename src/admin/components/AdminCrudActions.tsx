import React, { useState } from 'react';
import { 
    Stack, IconButton, Tooltip, Menu, MenuItem, 
    ListItemIcon, ListItemText, Dialog, DialogTitle, 
    DialogContent, DialogActions, Button, Typography,
    alpha
} from '@mui/material';
import { 
    Eye, Edit, Trash2, Archive, CheckCircle, XCircle, 
    UserPlus, Download, MoreVertical, AlertTriangle,
    Share2
} from 'lucide-react';
import { binThemeTokens } from '../theme/adminTheme';

export interface CrudAction {
    type: 'view' | 'edit' | 'delete' | 'archive' | 'approve' | 'reject' | 'assign' | 'export' | 'share';
    label?: string;
    onClick: (id: string) => void;
    color?: string;
    icon?: React.ReactNode;
    requiresConfirm?: boolean;
    confirmTitle?: string;
    confirmMessage?: string;
}

interface AdminCrudActionsProps {
    id: string;
    actions: CrudAction[];
    size?: 'small' | 'medium';
    mode?: 'icons' | 'menu';
}

export default function AdminCrudActions({ id, actions, size = 'small', mode = 'icons' }: AdminCrudActionsProps) {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [confirmAction, setConfirmAction] = useState<CrudAction | null>(null);

    const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    const triggerAction = (action: CrudAction) => {
        if (action.requiresConfirm) {
            setConfirmAction(action);
        } else {
            action.onClick(id);
        }
        handleMenuClose();
    };

    const getIcon = (type: string) => {
        const iconSize = size === 'small' ? 16 : 20;
        switch (type) {
            case 'view': return <Eye size={iconSize} />;
            case 'edit': return <Edit size={iconSize} />;
            case 'delete': return <Trash2 size={iconSize} />;
            case 'archive': return <Archive size={iconSize} />;
            case 'approve': return <CheckCircle size={iconSize} />;
            case 'reject': return <XCircle size={iconSize} />;
            case 'assign': return <UserPlus size={iconSize} />;
            case 'export': return <Download size={iconSize} />;
            case 'share': return <Share2 size={iconSize} />;
            default: return <MoreVertical size={iconSize} />;
        }
    };

    const getColor = (type: string) => {
        switch (type) {
            case 'delete':
            case 'reject': return binThemeTokens.danger;
            case 'approve': return '#10b981';
            case 'edit':
            case 'view':
            case 'assign':
            case 'export':
            case 'share': return binThemeTokens.gold;
            case 'archive': return 'rgba(255,255,255,0.4)';
            default: return '#FFF';
        }
    };

    if (mode === 'menu') {
        return (
            <>
                <IconButton size={size} onClick={handleMenuOpen} sx={{ color: 'rgba(255,255,255,0.3)' }}>
                    <MoreVertical size={size === 'small' ? 18 : 22} />
                </IconButton>
                <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={handleMenuClose}
                    PaperProps={{
                        sx: {
                            bgcolor: '#020617',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 2,
                            minWidth: 160
                        }
                    }}
                >
                    {actions.map((action, i) => (
                        <MenuItem key={i} onClick={() => triggerAction(action)} sx={{ py: 1.5 }}>
                            <ListItemIcon sx={{ color: getColor(action.type) }}>
                                {action.icon || getIcon(action.type)}
                            </ListItemIcon>
                            <ListItemText 
                                primary={action.label || action.type.toUpperCase()} 
                                primaryTypographyProps={{ variant: 'caption', fontWeight: 900, color: '#FFF' }}
                            />
                        </MenuItem>
                    ))}
                </Menu>

                {confirmAction && (
                    <Dialog 
                        open={Boolean(confirmAction)} 
                        onClose={() => setConfirmAction(null)}
                        PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', maxWidth: 400 } }}
                    >
                        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 950, color: binThemeTokens.danger }}>
                            <AlertTriangle size={24} />
                            {confirmAction.confirmTitle || 'CONFIRM ACTION'}
                        </DialogTitle>
                        <DialogContent>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                {confirmAction.confirmMessage || 'This action cannot be easily undone. Are you sure you wish to proceed?'}
                            </Typography>
                        </DialogContent>
                        <DialogActions sx={{ p: 3 }}>
                            <Button onClick={() => setConfirmAction(null)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
                            <Button 
                                variant="contained" 
                                color="error" 
                                onClick={() => { confirmAction.onClick(id); setConfirmAction(null); }}
                                sx={{ fontWeight: 950, borderRadius: 2 }}
                            >
                                PROCEED
                            </Button>
                        </DialogActions>
                    </Dialog>
                )}
            </>
        );
    }

    return (
        <Stack direction="row" spacing={1}>
            {actions.map((action, i) => (
                <Tooltip key={i} title={(action.label || action.type).toUpperCase()}>
                    <IconButton 
                        size={size} 
                        onClick={() => triggerAction(action)}
                        sx={{ 
                            color: getColor(action.type),
                            bgcolor: alpha(getColor(action.type), 0.05),
                            '&:hover': { bgcolor: alpha(getColor(action.type), 0.15) }
                        }}
                    >
                        {action.icon || getIcon(action.type)}
                    </IconButton>
                </Tooltip>
            ))}
            
            {confirmAction && (
                <Dialog 
                    open={Boolean(confirmAction)} 
                    onClose={() => setConfirmAction(null)}
                    PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', maxWidth: 400 } }}
                >
                    <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 950, color: binThemeTokens.danger }}>
                        <AlertTriangle size={24} />
                        {confirmAction.confirmTitle || 'CONFIRM ACTION'}
                    </DialogTitle>
                    <DialogContent>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                            {confirmAction.confirmMessage || 'This action cannot be easily undone. Are you sure you wish to proceed?'}
                        </Typography>
                    </DialogContent>
                    <DialogActions sx={{ p: 3 }}>
                        <Button onClick={() => setConfirmAction(null)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
                        <Button 
                            variant="contained" 
                            color="error" 
                            onClick={() => { confirmAction.onClick(id); setConfirmAction(null); }}
                            sx={{ fontWeight: 950, borderRadius: 2 }}
                        >
                            PROCEED
                        </Button>
                    </DialogActions>
                </Dialog>
            )}
        </Stack>
    );
}
