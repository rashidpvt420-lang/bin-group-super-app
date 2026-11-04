import React, { useRef, useState } from 'react';
import { Box, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import type { TechLang } from '../i18n/technicianLanguages';
import { techLocale, techT } from '../i18n/technicianLanguages';

import { appendPhrase, NO_PARTS_TEXT, QUICK_NOTE_PHRASES } from '../utils/quickNotes';

type Props = { lang: TechLang; notes: string; setNotes: (v: string) => void; materials: string; setMaterials: (v: string) => void; notesLabel: string; materialsLabel: string };

export default function TechnicianQuickNoteInput({ lang, notes, setNotes, materials, setMaterials, notesLabel, materialsLabel }: Props) {
  const tt = (k: string, en: string) => techT(lang, k, en);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const recRef = useRef<any>(null);
  const SpeechCtor: any = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

  const toggleVoice = () => {
    setVoiceError('');
    if (!SpeechCtor) { setVoiceError(tt('tech.job.voiceUnavailable', 'Voice typing is not available on this phone. Tap the buttons instead.')); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SpeechCtor();
    rec.lang = techLocale(lang);
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => { const said = String(e.results?.[0]?.[0]?.transcript || '').trim(); if (said) setNotes(appendPhrase(notes, said)); };
    rec.onerror = () => setVoiceError(tt('tech.job.voiceUnavailable', 'Voice typing is not available on this phone. Tap the buttons instead.'));
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <Box data-testid="technician-quick-note" sx={{ mb: 2 }}>
      <Typography sx={{ fontWeight: 800, mb: 1, color: '#111827' }}>{tt('tech.job.quickNotes', 'Tap what you did')}</Typography>
      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
        {QUICK_NOTE_PHRASES.map((p) => (
          <Chip key={p.key} data-testid={`quick-note-${p.key.split('.').pop()}`} label={tt(p.key, p.en)} onClick={() => setNotes(appendPhrase(notes, p.en))} sx={{ minHeight: 44, fontSize: 15, fontWeight: 800 }} />
        ))}
      </Stack>
      <Button data-testid="technician-voice-note" variant={listening ? 'contained' : 'outlined'} color={listening ? 'error' : 'primary'} onClick={toggleVoice} sx={{ minHeight: 48, mb: 1.5, fontWeight: 900 }} fullWidth>
        🎤 {listening ? tt('tech.job.listening', 'Listening… tap to stop') : tt('tech.job.speak', 'Speak your note')}
      </Button>
      {voiceError && <Typography data-testid="technician-voice-error" sx={{ color: '#B45309', fontSize: 13, mb: 1 }}>{voiceError}</Typography>}
      <TextField fullWidth multiline minRows={2} label={notesLabel} value={notes} onChange={(e) => setNotes(e.target.value)} sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { color: '#111827' }, '& label': { color: '#475569' } }} />
      <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip data-testid="quick-note-no-parts" color={materials === NO_PARTS_TEXT ? 'success' : 'default'} label={tt('tech.job.noParts', NO_PARTS_TEXT)} onClick={() => setMaterials(NO_PARTS_TEXT)} sx={{ minHeight: 44, fontSize: 15, fontWeight: 800 }} />
      </Stack>
      <TextField fullWidth label={materialsLabel} value={materials} onChange={(e) => setMaterials(e.target.value)} sx={{ '& .MuiOutlinedInput-root': { color: '#111827' }, '& label': { color: '#475569' } }} />
    </Box>
  );
}
