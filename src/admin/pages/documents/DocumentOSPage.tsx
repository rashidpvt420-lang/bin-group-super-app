import React from 'react';
import { Box, Container, Grid, Paper, Stack, Typography, Chip, Button, Divider, TextField, MenuItem, Alert, alpha } from '@mui/material';
import { FileText, UploadCloud, ScanText, BellRing, ClipboardCheck, Scale, MessageCircle, Wand2, ShieldCheck, CalendarClock } from 'lucide-react';
import { binThemeTokens } from '../../theme/adminTheme';
import LaunchStatusBanner from '../../components/LaunchStatusBanner';
import { comingSoon } from '../../utils/launchDataHygiene';

const placeholders = [
  '{{Owner_Name}}', '{{Tenant_Name}}', '{{Unit_Number}}', '{{Property_Address}}',
  '{{Annual_Rent}}', '{{Security_Deposit}}', '{{Lease_Start_Date}}', '{{Lease_End_Date}}',
  '{{Payment_Plan}}', '{{Cheque_Count}}', '{{Notice_Date}}', '{{Renewal_Increase}}'
];

const pillars = [
  { icon: <UploadCloud />, title: 'Bring Your Own Contract', desc: 'Owner uploads lease, notice, renewal or demand-letter templates with dynamic placeholders.' },
  { icon: <ScanText />, title: 'AI Lease Abstraction', desc: 'Extract tenant, unit, rent, expiry, cheque schedule and deposit from legacy PDFs.' },
  { icon: <CalendarClock />, title: '90-Day Renewal Workflow', desc: 'Daily expiry scan, owner approval queue, notice generation and audit trail.' },
  { icon: <ClipboardCheck />, title: 'Move-In / Move-Out Evidence', desc: 'Structured photo inspection, damage comparison and dilapidation PDF report.' },
  { icon: <Scale />, title: 'Legal Evidence Pack', desc: 'Lawyer-ready pack with contract, cheque, notices, communication and evidence logs.' },
  { icon: <MessageCircle />, title: 'WhatsApp Notice Log', desc: 'Send tenant reminders and tracking links while saving delivery proof to Firebase.' },
];

const demoFlows = [
  'Upload DOCX/PDF template',
  'Map placeholders to Firebase fields',
  'Generate draft PDF',
  'Owner/Admin approval',
  'Tenant view/sign or acknowledge',
  'Save PDF + hash + audit log to Evidence Vault',
];

export default function DocumentOSPage() {
  const safeAction = () => comingSoon('Document OS is setup-protected for launch. Connect template upload, storage, PDF generation and audit logging before enabling this action.');

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 }, px: { xs: 2, md: 3 } }}>
      <Stack spacing={4}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
              BIN GROUP DOCUMENT OS™
            </Typography>
            <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, mt: 1, fontSize: { xs: '2.1rem', md: '3rem' }, lineHeight: 1.05 }}>
              Contracts, Notices & Evidence Automation
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.58)', maxWidth: 900, mt: 1 }}>
              A UAE-first document operating layer for owners, tenants, brokers and admin teams: custom lease templates, AI lease reading, renewal notices, inspection reports and legal evidence packs.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip label="MVP / SETUP PROTECTED" sx={{ bgcolor: alpha('#f59e0b', 0.12), color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', fontWeight: 950 }} />
            <Chip label="Made in UAE 🇦🇪" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, fontWeight: 950, px: 1 }} />
          </Stack>
        </Box>

        <LaunchStatusBanner
          title="Document OS is not a live production module yet"
          message="This page is now clearly labelled as MVP. Upload, AI extraction, template workflow and evidence-pack actions are blocked until backend services are connected."
        />

        <Alert severity="info" sx={{ bgcolor: 'rgba(59,130,246,0.08)', color: '#bfdbfe', border: '1px solid rgba(59,130,246,0.25)' }}>
          v1 scope: template registry design, placeholder mapping plan, AI extraction intake, renewal workflow planning and evidence-pack assembly. Legal filing remains owner/lawyer-reviewed.
        </Alert>

        <Grid container spacing={3}>
          {pillars.map((item) => (
            <Grid item xs={12} md={6} lg={4} key={item.title}>
              <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,0.78)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                <Box sx={{ color: binThemeTokens.gold, mb: 2 }}>{React.cloneElement(item.icon, { size: 28 })}</Box>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{item.title}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', mt: 1 }}>{item.desc}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Paper sx={{ p: { xs: 2.5, md: 4 }, bgcolor: '#07111f', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 4 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                <FileText color={binThemeTokens.gold} />
                <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>Custom Template Registry</Typography>
              </Stack>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}><TextField fullWidth label="Template Name" placeholder="Villa Lease Renewal 2026" disabled /></Grid>
                <Grid item xs={12} md={6}>
                  <TextField select fullWidth label="Document Type" defaultValue="lease" disabled>
                    <MenuItem value="lease">Lease Agreement</MenuItem>
                    <MenuItem value="renewal_notice">Renewal Notice</MenuItem>
                    <MenuItem value="move_in">Move-In Report</MenuItem>
                    <MenuItem value="move_out">Move-Out Report</MenuItem>
                    <MenuItem value="legal_pack">Legal Evidence Pack</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12}>
                  <Paper onClick={safeAction} sx={{ p: 3, borderRadius: 3, border: '1px dashed rgba(255,255,255,0.18)', bgcolor: 'rgba(255,255,255,0.025)', textAlign: 'center', cursor: 'pointer' }}>
                    <UploadCloud color={binThemeTokens.gold} />
                    <Typography sx={{ color: '#fff', fontWeight: 900, mt: 1 }}>Upload disabled until storage workflow is connected</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>This prevents fake uploads and broken template states.</Typography>
                  </Paper>
                </Grid>
              </Grid>

              <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.08)' }} />
              <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 2 }}>Supported placeholders</Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {placeholders.map((p) => <Chip key={p} label={p} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#dbeafe', fontFamily: 'monospace' }} />)}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: { xs: 2.5, md: 4 }, height: '100%', bgcolor: '#07111f', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 4 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
                <Wand2 color={binThemeTokens.gold} />
                <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>Automation Flow</Typography>
              </Stack>
              <Stack spacing={2}>
                {demoFlows.map((flow, index) => (
                  <Box key={flow} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Box sx={{ width: 34, height: 34, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950 }}>{index + 1}</Box>
                    <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700 }}>{flow}</Typography>
                  </Box>
                ))}
              </Stack>
              <Button fullWidth variant="contained" onClick={safeAction} sx={{ mt: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3 }}>
                Setup Required
              </Button>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 4 }}>
              <ShieldCheck color="#10b981" />
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 2 }}>Evidence Vault Required</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)' }}>Generated PDFs must be stored with timestamp, actor, source record and hash before this module goes live.</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 4 }}>
              <BellRing color="#f59e0b" />
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 2 }}>Renewal Queue Pending</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)' }}>Notice generation is blocked until tenant lease dates and email/WhatsApp delivery logs are connected.</Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 4 }}>
              <ScanText color="#60a5fa" />
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 2 }}>AI Reading Pending</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)' }}>Legacy lease extraction requires a connected parser and admin review queue.</Typography>
            </Paper>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  );
}
