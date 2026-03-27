import React from 'react';
import { NavLink } from 'react-router-dom';
import { Drawer, List, ListItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MapIcon from '@mui/icons-material/Map';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import BarChartIcon from '@mui/icons-material/BarChart';
import SettingsIcon from '@mui/icons-material/Settings';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RadarIcon from '@mui/icons-material/Radar';
import SecurityIcon from '@mui/icons-material/Security';

const Navigation = () => {
    const menuItems = [
        { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
        { text: 'INTAKE VAULT (V1.15)', icon: <SecurityIcon sx={{ color: '#b59410' }} />, path: '/admin/vault' },
        { text: 'GOD MODE (CEO)', icon: <TrendingUpIcon sx={{ color: '#8b5cf6' }} />, path: '/god-mode' },
        { text: 'SOS EMERGENCY', icon: <PendingActionsIcon sx={{ color: '#ef4444' }} />, path: '/sos' },
        { text: 'Bulk Import (500+)', icon: <CloudUploadIcon sx={{ color: '#1a237e' }} />, path: '/bulk-import' },
        { text: 'Map', icon: <MapIcon />, path: '/map' },
        { text: 'Live Operations', icon: <RadarIcon sx={{ color: '#3b82f6' }} />, path: '/admin/live-ops' },
        { text: 'Pilot Control', icon: <RadarIcon sx={{ color: '#059669' }} />, path: '/admin/pilot' },
        { text: 'Owners', icon: <PeopleIcon />, path: '/owners' },
        { text: 'Brokers', icon: <PeopleIcon sx={{ color: '#f59e0b' }} />, path: '/broker' },
        { text: 'Tickets', icon: <ReceiptIcon />, path: '/tickets' },
        { text: '💰 Profit Engine', icon: <TrendingUpIcon sx={{ color: '#16a34a' }} />, path: '/admin/profitability' },
        { text: 'Pricing & Plans', icon: <ReceiptIcon />, path: '/pricing' },
        { text: 'Procurement', icon: <PendingActionsIcon />, path: '/procurement' },
        { text: 'Manual Approvals', icon: <PendingActionsIcon sx={{ color: '#10b981' }} />, path: '/admin/manual-approvals' },
        { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
    ];

    return (
        <Drawer
            variant="permanent"
            sx={{
                width: 240,
                flexShrink: 0,
                '& .MuiDrawer-paper': { width: 240, boxSizing: 'border-box' },
            }}
        >
            <div className="p-5 font-bold text-[1.2rem]">
                BIN GROUP ADMIN
            </div>
            <Divider />
            <List>
                {menuItems.map((item) => (
                    <ListItem key={item.text} component={NavLink} to={item.path} className="no-underline text-inherit">
                        <ListItemIcon>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.text} />
                    </ListItem>
                ))}
            </List>
            <Divider sx={{ mt: 'auto' }} />
            <List>
                <ListItem
                    button
                    onClick={() => window.open('http://localhost:3001', '_blank')}
                    className="text-[#10b981]"
                >
                    <ListItemIcon><PeopleIcon sx={{ color: '#10b981' }} /></ListItemIcon>
                    <ListItemText primary="View Owner Portal ↗" />
                </ListItem>
            </List>
        </Drawer>
    );
};

export default Navigation;
