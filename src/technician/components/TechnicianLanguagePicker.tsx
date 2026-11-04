import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { TECH_LANGUAGES, type TechLang } from '../i18n/technicianLanguages';

/** Big tap targets with each language written in its own script, so no reading of English is needed. */
export default function TechnicianLanguagePicker({ value, onChange, label }: { value: TechLang; onChange: (lang: TechLang) => void; label: string }) {
  return (
    <Box data-testid="technician-language-picker" sx={{ bgcolor: '#FFFFFF', borderRadius: 3, p: 1.5, border: '1px solid #E5E7EB' }}>
      <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 1 }}>🌐 {label}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 1 }}>
        {TECH_LANGUAGES.map((l) => (
          <ButtonBase key={l.code} data-testid={`technician-lang-${l.code}`} aria-pressed={value === l.code} aria-label={l.englishName} onClick={() => onChange(l.code)}
            sx={{ minHeight: 48, borderRadius: 2, fontSize: 16, fontWeight: 800, border: value === l.code ? '2px solid #111827' : '1px solid #D1D5DB', bgcolor: value === l.code ? '#FEF3C7' : '#F9FAFB', color: '#111827' }}>
            <span dir={l.dir}>{l.nativeName}</span>
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}
