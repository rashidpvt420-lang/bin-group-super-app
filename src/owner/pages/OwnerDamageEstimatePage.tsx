import React, { useRef, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Divider, Grid, Paper,
  Stack, Typography, alpha, LinearProgress,
} from '@mui/material';
import {
  AlertTriangle, Camera, CheckCircle2, Clock, DollarSign,
  FileImage, RefreshCw, Upload, Wrench, Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { functions, httpsCallable } from '../../lib/firebase';

const gold = binThemeTokens.gold;
const CARD = 'rgba(15, 23, 42, 0.42)';
const BORDER = `1px solid ${alpha(gold, 0.18)}`;

const SEVERITY_COLORS: Record<string, string> = {
  LOW: '#22C55E', MEDIUM: gold, HIGH: '#F59E0B', CRITICAL: '#EF4444',
};
const URGENCY_ICONS: Record<string, any> = {
  ROUTINE: Clock, PRIORITY: Zap, EMERGENCY: AlertTriangle,
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function OwnerDamageEstimatePage() {
  const navigate = useNavigate();
  const { isRTL, tx } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileSelect(f: File | null) {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }

  async function analyzeImage() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const base64 = await fileToBase64(file);
      const fn = httpsCallable(functions, 'assessDamage');
      const res: any = await fn({ imageBase64: base64, mimeType: file.type });
      const data = res.data || {};
      if (data.success !== true || !data.assessment) {
        setError(data.message || 'Live image analysis is unavailable. No diagnosis or cost range was produced.');
        return;
      }
      setResult(data);
    } catch (e: any) {
      setError(e?.message || 'Damage pre-screening failed. No diagnosis or quotation was produced.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPreview(null);
    setFile(null);
    setResult(null);
    setError(null);
  }

  const dir = isRTL ? 'rtl' : 'ltr';
  const assessment = result?.success === true ? result.assessment : null;
  const severityColor = assessment ? (SEVERITY_COLORS[assessment.severity] || gold) : gold;
  const UrgencyIcon = assessment ? (URGENCY_ICONS[assessment.urgency] || Clock) : Clock;

  return (
    <Box sx={{ pb: 8, direction: dir }}>
      <Box sx={{ mb: 5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <Box sx={{ p: 1, bgcolor: alpha(gold, 0.12), borderRadius: 2, color: gold, display: 'inline-flex' }}>
            <Camera size={20} />
          </Box>
          <Typography variant="overline" sx={{ color: gold, fontWeight: 900, letterSpacing: 4 }}>
            {tx('damage.prescreen_overline', 'AI VISUAL PRE-SCREEN')}
          </Typography>
        </Stack>
        <Typography variant="h4" fontWeight={950} sx={{ color: '#fff', mb: 1 }}>
          {tx('damage.prescreen_title', 'Photo → Advisory Pre-Screen')}
        </Typography>
        <Typography variant="body2" sx={{ color: alpha('#fff', 0.52), maxWidth: 680, fontWeight: 700, lineHeight: 1.7 }}>
          {tx('damage.prescreen_subtitle', 'Upload a damage photo for an AI visual pre-screen. Results are not an inspection, confirmed diagnosis, work approval, dispatch instruction, or commercial quotation.')}
        </Typography>
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3.5, bgcolor: CARD, border: BORDER, borderRadius: 4 }}>
            <Typography variant="overline" sx={{ color: alpha(gold, 0.7), fontWeight: 900, letterSpacing: 2 }}>
              UPLOAD DAMAGE PHOTO
            </Typography>

            <Box
              onClick={() => !preview && fileRef.current?.click()}
              sx={{
                mt: 2, mb: 2.5,
                height: 240,
                borderRadius: 3,
                border: `2px dashed ${alpha(gold, preview ? 0.4 : 0.22)}`,
                bgcolor: alpha(gold, 0.04),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
                cursor: preview ? 'default' : 'pointer',
                transition: 'all .2s',
                '&:hover': !preview ? { borderColor: alpha(gold, 0.5), bgcolor: alpha(gold, 0.07) } : {},
              }}
            >
              {preview ? (
                <Box component="img" src={preview} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Stack alignItems="center" spacing={1.5}>
                  <FileImage size={40} color={alpha(gold, 0.35)} />
                  <Typography sx={{ color: alpha('#fff', 0.35), fontWeight: 800, fontSize: '0.85rem' }}>
                    Tap to upload an image
                  </Typography>
                </Stack>
              )}
            </Box>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={e => handleFileSelect(e.target.files?.[0] || null)}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => handleFileSelect(e.target.files?.[0] || null)}
            />

            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5}>
                <Button
                  fullWidth
                  startIcon={<Camera size={17} />}
                  onClick={() => cameraRef.current?.click()}
                  sx={{ bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950, borderRadius: 3, border: `1px solid ${alpha(gold, 0.25)}` }}
                >
                  Camera
                </Button>
                <Button
                  fullWidth
                  startIcon={<Upload size={17} />}
                  onClick={() => fileRef.current?.click()}
                  sx={{ bgcolor: alpha('#fff', 0.05), color: alpha('#fff', 0.7), fontWeight: 950, borderRadius: 3, border: `1px solid ${alpha('#fff', 0.12)}` }}
                >
                  Gallery
                </Button>
              </Stack>

              {preview && !loading && (
                <Button
                  fullWidth
                  variant="contained"
                  onClick={analyzeImage}
                  sx={{ bgcolor: gold, color: '#111827', fontWeight: 950, py: 1.4, borderRadius: 3, boxShadow: `0 10px 28px ${alpha(gold, 0.35)}` }}
                >
                  Run AI Visual Pre-Screen
                </Button>
              )}

              {loading && (
                <Box sx={{ textAlign: 'center', py: 2 }}>
                  <CircularProgress size={28} sx={{ color: gold }} />
                  <Typography variant="caption" sx={{ color: alpha('#fff', 0.4), display: 'block', mt: 1, fontWeight: 900 }}>
                    RUNNING ADVISORY PRE-SCREEN…
                  </Typography>
                  <LinearProgress sx={{ mt: 1.5, bgcolor: alpha(gold, 0.12), '& .MuiLinearProgress-bar': { bgcolor: gold } }} />
                </Box>
              )}

              {preview && !loading && (
                <Button size="small" startIcon={<RefreshCw size={14} />} onClick={reset}
                  sx={{ color: alpha('#fff', 0.35), fontWeight: 800, fontSize: '0.72rem' }}>
                  Clear & Start Over
                </Button>
              )}

              {error && (
                <Box sx={{ p: 2, bgcolor: alpha('#EF4444', 0.08), border: `1px solid ${alpha('#EF4444', 0.22)}`, borderRadius: 3 }}>
                  <Typography sx={{ color: '#EF4444', fontWeight: 900, fontSize: '0.8rem', mb: 0.5 }}>NO LIVE AI ASSESSMENT</Typography>
                  <Typography sx={{ color: alpha('#fff', 0.65), fontWeight: 700, fontSize: '0.8rem' }}>{error}</Typography>
                </Box>
              )}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={7}>
          {!assessment && !loading && (
            <Paper sx={{ p: 4, bgcolor: CARD, border: BORDER, borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <Camera size={48} color={alpha(gold, 0.25)} />
              <Typography sx={{ color: alpha('#fff', 0.38), fontWeight: 800, textAlign: 'center' }}>
                Upload a photo for an advisory visual pre-screen. A technician must inspect the property before diagnosis, pricing, approval, or work begins.
              </Typography>
              <Typography variant="caption" sx={{ color: alpha('#fff', 0.24), fontWeight: 700, textAlign: 'center' }}>
                Supported examples: water leaks · paint damage · tile cracks · AC issues · electrical faults · plumbing · visible structural concerns
              </Typography>
            </Paper>
          )}

          {assessment && (
            <Stack spacing={2.5}>
              <Paper sx={{ p: 2, bgcolor: alpha('#F59E0B', 0.08), border: `1px solid ${alpha('#F59E0B', 0.28)}`, borderRadius: 3 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                  <Typography sx={{ color: '#F59E0B', fontWeight: 950, fontSize: '0.78rem', letterSpacing: 1.4 }}>
                    AI PRE-SCREEN · NOT INSPECTED · NOT A QUOTATION
                  </Typography>
                  <Chip size="small" label={`LIVE · ${String(result.provider || 'AI').toUpperCase()}`} sx={{ color: '#10B981', bgcolor: alpha('#10B981', 0.08), fontWeight: 950 }} />
                </Stack>
              </Paper>

              <Paper sx={{ p: 3.5, bgcolor: alpha(severityColor, 0.07), border: `1px solid ${alpha(severityColor, 0.28)}`, borderRadius: 4 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography sx={{ color: alpha('#fff', 0.45), fontWeight: 900, fontSize: '0.68rem', letterSpacing: 2 }}>VISIBLE DAMAGE CATEGORY</Typography>
                    <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', mt: 0.3 }}>{assessment.damageType}</Typography>
                    <Typography variant="body2" sx={{ color: alpha('#fff', 0.55), mt: 1, lineHeight: 1.7, maxWidth: 420 }}>
                      {assessment.description}
                    </Typography>
                  </Box>
                  <Stack spacing={1} alignItems="flex-end">
                    <Chip label={assessment.severity} sx={{ bgcolor: alpha(severityColor, 0.15), color: severityColor, fontWeight: 950, border: `1px solid ${alpha(severityColor, 0.3)}` }} />
                    <Chip icon={<UrgencyIcon size={13} />} label={assessment.urgency} size="small" sx={{ bgcolor: alpha(severityColor, 0.08), color: alpha(severityColor, 0.8), fontWeight: 950, fontSize: '0.65rem' }} />
                  </Stack>
                </Stack>
              </Paper>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Paper sx={{ p: 3, bgcolor: CARD, border: BORDER, borderRadius: 3 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                      <DollarSign size={18} color={gold} />
                      <Typography variant="caption" sx={{ color: alpha('#fff', 0.4), fontWeight: 900, letterSpacing: 1.5 }}>INDICATIVE PLANNING RANGE</Typography>
                    </Stack>
                    <Typography sx={{ color: gold, fontWeight: 950, fontSize: '1.6rem' }}>
                      {Number(assessment.estimatedCostMin).toLocaleString()} – {Number(assessment.estimatedCostMax).toLocaleString()} AED
                    </Typography>
                    <Typography variant="caption" sx={{ color: alpha('#fff', 0.35), fontWeight: 800 }}>AI visual estimate only · not a commercial quotation</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper sx={{ p: 3, bgcolor: CARD, border: BORDER, borderRadius: 3 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                      <Wrench size={18} color={gold} />
                      <Typography variant="caption" sx={{ color: alpha('#fff', 0.4), fontWeight: 900, letterSpacing: 2 }}>SUGGESTED INSPECTION TRADE</Typography>
                    </Stack>
                    <Typography sx={{ color: '#fff', fontWeight: 950, fontSize: '1.2rem' }}>{assessment.trade}</Typography>
                    <Typography variant="caption" sx={{ color: alpha('#fff', 0.35), fontWeight: 800 }}>No technician has been assigned or dispatched</Typography>
                  </Paper>
                </Grid>
              </Grid>

              <Paper sx={{ p: 3, bgcolor: CARD, border: BORDER, borderRadius: 3 }}>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <CheckCircle2 size={18} color="#22C55E" style={{ flexShrink: 0, marginTop: 2 }} />
                    <Box>
                      <Typography variant="caption" sx={{ color: alpha('#22C55E', 0.7), fontWeight: 900, letterSpacing: 1.5 }}>ADVISORY NEXT STEP</Typography>
                      <Typography sx={{ color: alpha('#fff', 0.78), fontWeight: 800, fontSize: '0.88rem', mt: 0.4 }}>{assessment.recommendedAction}</Typography>
                    </Box>
                  </Stack>
                  <Divider sx={{ borderColor: alpha(gold, 0.1) }} />
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <AlertTriangle size={16} color={gold} style={{ flexShrink: 0, marginTop: 2 }} />
                    <Box>
                      <Typography variant="caption" sx={{ color: alpha(gold, 0.65), fontWeight: 900, letterSpacing: 1.5 }}>PREVENTION GUIDANCE</Typography>
                      <Typography sx={{ color: alpha('#fff', 0.55), fontWeight: 800, fontSize: '0.85rem', mt: 0.4 }}>{assessment.preventionNote}</Typography>
                    </Box>
                  </Stack>
                </Stack>
              </Paper>

              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  onClick={() => navigate('/owner/tickets')}
                  sx={{ flex: 1, bgcolor: gold, color: '#111827', fontWeight: 950, py: 1.4, borderRadius: 3 }}
                >
                  Request On-Site Inspection
                </Button>
                <Button
                  variant="outlined"
                  onClick={reset}
                  sx={{ borderColor: alpha(gold, 0.35), color: gold, fontWeight: 950, py: 1.4, borderRadius: 3 }}
                >
                  New Photo
                </Button>
              </Stack>

              <Typography variant="caption" sx={{ color: alpha('#fff', 0.28), textAlign: 'center', lineHeight: 1.5 }}>
                This is an AI visual pre-screen only. Actual scope, safety classification, and price require an on-site inspection and verified BIN GROUP quotation.
                {result?.provider && ` · Live engine: ${result.provider}${result.model ? `/${result.model}` : ''}`}
              </Typography>
            </Stack>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
