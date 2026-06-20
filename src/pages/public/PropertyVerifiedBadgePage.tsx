import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Button, Chip, CircularProgress, Container, Divider, Grid,
  Paper, Stack, Typography, alpha,
} from '@mui/material';
import { Award, CheckCircle2, Copy, Download, ExternalLink, ShieldCheck } from 'lucide-react';
import { db, doc, getDoc } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import QRCode from 'react-qr-code';

const gold = binThemeTokens.gold;
const PASSPORT_URL = (id: string) => `${window.location.origin}/passport/${id}`;

export default function PropertyVerifiedBadgePage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    async function load() {
      try {
        let snap = await getDoc(doc(db, 'propertyPassports', id));
        if (!snap.exists()) snap = await getDoc(doc(db, 'properties', id));
        if (snap.exists()) setProperty({ id: snap.id, ...snap.data() });
      } catch { /* not found */ }
      setLoading(false);
    }
    load();
  }, [id]);

  function copyEmbed() {
    const passportUrl = PASSPORT_URL(id || '');
    const code = `<!-- BIN GROUP Verified Property Badge -->
<a href="${passportUrl}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;">
  <div style="background:#111827;border:1.5px solid #C9A646;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:10px;font-family:sans-serif;">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A646" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    <div>
      <div style="color:#C9A646;font-size:10px;font-weight:900;letter-spacing:2px;">BIN GROUP VERIFIED</div>
      <div style="color:#fff;font-size:12px;font-weight:800;">Maintenance Record</div>
    </div>
  </div>
</a>`;
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  function downloadSVGBadge() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60" viewBox="0 0 240 60">
  <rect width="240" height="60" rx="10" fill="#111827" stroke="#C9A646" stroke-width="1.5"/>
  <path d="M20 30 L20 18 L30 14 L40 18 L40 30 C40 38 30 42 30 42 C30 42 20 38 20 30Z" fill="none" stroke="#C9A646" stroke-width="2"/>
  <text x="52" y="24" font-family="sans-serif" font-size="9" font-weight="900" fill="#C9A646" letter-spacing="2">BIN GROUP VERIFIED</text>
  <text x="52" y="40" font-family="sans-serif" font-size="11" font-weight="800" fill="#ffffff">Maintenance Record</text>
  <text x="52" y="52" font-family="sans-serif" font-size="8" fill="rgba(255,255,255,0.4)">bin-groups.com · Al Ain, UAE</text>
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BIN-GROUP-Verified-Badge-${id}.svg`;
    a.click();
  }

  if (loading) return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0B0B0C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress sx={{ color: gold }} />
    </Box>
  );

  const passportUrl = PASSPORT_URL(id || '');
  const score = property?.maintenanceCreditScore || property?.healthScore || 0;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0B0B0C', color: '#fff' }}>
      <Box sx={{ bgcolor: '#111827', py: 0.8, borderBottom: `1px solid ${alpha(gold, 0.2)}` }}>
        <Container maxWidth="md">
          <Stack direction="row" justifyContent="center" spacing={1.5} alignItems="center">
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#22C55E', boxShadow: '0 0 6px #22C55E' }} />
            <Typography sx={{ color: alpha('#fff', 0.7), fontSize: '0.72rem', fontWeight: 800 }}>BIN GROUP · Verification Badge Hub · Al Ain, UAE</Typography>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Chip label="PROPERTY FINDER · DUBIZZLE · BAYUT" sx={{ bgcolor: alpha(gold, 0.1), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.25)}`, letterSpacing: 2, mb: 3 }} />
          <Typography variant="h3" fontWeight={950} sx={{ color: '#fff', mb: 1 }}>Add the Verified Badge to Your Listing</Typography>
          <Typography variant="body1" sx={{ color: alpha('#fff', 0.45), fontWeight: 700, maxWidth: 540, mx: 'auto' }}>
            Properties with a BIN GROUP Verified Maintenance Record attract more serious buyers and command higher rents.
          </Typography>
        </Box>

        {/* Live badge preview */}
        <Paper sx={{ p: 4, mb: 4, bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${alpha(gold, 0.2)}`, borderRadius: 4, textAlign: 'center' }}>
          <Typography variant="overline" sx={{ color: alpha(gold, 0.6), fontWeight: 900, letterSpacing: 3, display: 'block', mb: 3 }}>BADGE PREVIEW</Typography>
          <Stack alignItems="center" spacing={3}>
            {/* Badge */}
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5, bgcolor: '#111827', border: `1.5px solid ${gold}`, borderRadius: 2.5, px: 2.5, py: 1.5 }}>
              <ShieldCheck size={22} color={gold} />
              <Box sx={{ textAlign: 'left' }}>
                <Typography sx={{ color: gold, fontWeight: 950, fontSize: '0.68rem', letterSpacing: 2 }}>BIN GROUP VERIFIED</Typography>
                <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '0.88rem' }}>Maintenance Record</Typography>
              </Box>
              {score > 0 && (
                <>
                  <Divider orientation="vertical" flexItem sx={{ borderColor: alpha(gold, 0.3) }} />
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{ color: gold, fontWeight: 950, fontSize: '1.1rem', lineHeight: 1 }}>{score}</Typography>
                    <Typography sx={{ color: alpha(gold, 0.5), fontSize: '0.6rem', fontWeight: 900 }}>SCORE</Typography>
                  </Box>
                </>
              )}
            </Box>

            {property && (
              <Typography sx={{ color: alpha('#fff', 0.4), fontWeight: 800, fontSize: '0.85rem' }}>
                {property.address || property.propertyName || `Property ${id}`}
              </Typography>
            )}
          </Stack>
        </Paper>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* QR Code */}
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 3.5, bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${alpha(gold, 0.18)}`, borderRadius: 4, height: '100%' }}>
              <Typography variant="overline" sx={{ color: alpha(gold, 0.6), fontWeight: 900, letterSpacing: 3, display: 'block', mb: 2.5 }}>QR CODE</Typography>
              <Box sx={{ bgcolor: '#fff', p: 2.5, borderRadius: 3, display: 'inline-block', mb: 2 }}>
                <QRCode value={passportUrl} size={160} level="H" />
              </Box>
              <Typography variant="caption" sx={{ color: alpha('#fff', 0.3), display: 'block', fontWeight: 800 }}>
                Scan to view full maintenance history
              </Typography>
              <Button
                fullWidth size="small" startIcon={<ExternalLink size={14} />}
                onClick={() => window.open(passportUrl, '_blank')}
                sx={{ mt: 2, color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.28)}`, borderRadius: 2 }}
              >
                View Live Passport
              </Button>
            </Paper>
          </Grid>

          {/* Embed code */}
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 3.5, bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${alpha(gold, 0.18)}`, borderRadius: 4, height: '100%' }}>
              <Typography variant="overline" sx={{ color: alpha(gold, 0.6), fontWeight: 900, letterSpacing: 3, display: 'block', mb: 2.5 }}>EMBED IN YOUR LISTING</Typography>
              <Box sx={{ bgcolor: 'rgba(0,0,0,0.4)', borderRadius: 2, p: 2, mb: 2, fontFamily: 'monospace', fontSize: '0.72rem', color: alpha('#fff', 0.55), overflowX: 'auto' }}>
                {`<a href="${passportUrl}" ...>`}<br />
                {'  <div style="background:#111827...">'}<br />
                {'    BIN GROUP VERIFIED badge'}<br />
                {'  </div>'}<br />
                {'</a>'}
              </Box>
              <Stack spacing={1.5}>
                <Button fullWidth startIcon={copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  onClick={copyEmbed}
                  sx={{ bgcolor: copied ? alpha('#22C55E', 0.12) : alpha(gold, 0.12), color: copied ? '#22C55E' : gold, fontWeight: 950, borderRadius: 3, border: `1px solid ${alpha(copied ? '#22C55E' : gold, 0.3)}` }}>
                  {copied ? 'Copied to Clipboard!' : 'Copy HTML Embed Code'}
                </Button>
                <Button fullWidth startIcon={<Download size={16} />} onClick={downloadSVGBadge}
                  sx={{ color: alpha('#fff', 0.6), fontWeight: 950, borderRadius: 3, border: `1px solid ${alpha('#fff', 0.12)}` }}>
                  Download SVG Badge
                </Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        {/* Trust points */}
        <Paper sx={{ p: 3.5, bgcolor: alpha(gold, 0.04), border: `1px solid ${alpha(gold, 0.18)}`, borderRadius: 4 }}>
          <Typography variant="overline" sx={{ color: alpha(gold, 0.65), fontWeight: 900, letterSpacing: 3, display: 'block', mb: 2.5 }}>
            WHY THIS BADGE MATTERS ON PROPERTY FINDER & DUBIZZLE
          </Typography>
          <Stack spacing={1.5}>
            {[
              'Tenants prefer verified properties — reduces vacancy time',
              'Documented maintenance history justifies higher rent and sale price',
              'Digital proof trail available to buyers during due diligence',
              'Shows commitment to property care and transparency',
              'BIN GROUP licensed under Abu Dhabi trade licence — credible third-party verification',
            ].map(item => (
              <Stack key={item} direction="row" spacing={1.5} alignItems="flex-start">
                <Award size={15} color={gold} style={{ flexShrink: 0, marginTop: 2 }} />
                <Typography variant="body2" sx={{ color: alpha('#fff', 0.6), fontWeight: 800 }}>{item}</Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

