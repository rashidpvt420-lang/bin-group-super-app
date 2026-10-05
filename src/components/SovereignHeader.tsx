import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Box, Button, IconButton, alpha, Badge, Stack } from '@mui/material';
import { useLanguage, useRole } from '@bin/shared';
import { useCustomTheme } from '../context/ThemeContext';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { binThemeTokens } from '../theme/binGroupTheme';
import { auth, db, collection, query, where, onSnapshot } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate, useLocation } from 'react-router-dom';

const BinGroupHeader = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minWidth: 0,
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 38,
          height: 38,
          borderRadius: 3,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'rgba(212,175,55,0.12)',
          border: '1px solid rgba(212,175,55,0.35)',
          color: '#d4af37',
          fontWeight: 950,
          letterSpacing: -1,
          fontSize: 18,
        }}
      >
        BG
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            color: '#fff',
            fontWeight: 950,
            letterSpacing: 1.6,
            lineHeight: 1,
            fontSize: { xs: 14, md: 16 },
            whiteSpace: 'nowrap',
          }}
        >
          BIN GROUP
        </Typography>
        <Typography
          sx={{
            color: 'rgba(212,175,55,0.82)',
            fontWeight: 900,
            letterSpacing: 2.2,
            lineHeight: 1.1,
            fontSize: 9,
            whiteSpace: 'nowrap',
          }}
        >
          SOVEREIGN PROPERTY OS
        </Typography>
      </Box>
    </Box>
  );
};

export default BinGroupHeader;
