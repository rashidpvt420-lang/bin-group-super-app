import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Stack,
  TextField,
  Typography,
  alpha,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Collapse,
} from '@mui/material';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  GitBranch,
  GitPullRequest,
  History,
  Rocket,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GitCommit,
} from 'lucide-react';
import { addDoc, collection, db, serverTimestamp, onSnapshot, query, orderBy, limit } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { binThemeTokens } from '../../theme/adminTheme';
import { useLanguage } from '@bin/shared';

const ENGINEER_ADMIN_ROLES = new Set(['admin', 'super_admin', 'ceo', 'manager', 'operations_admin']);

const workflowSteps = [
  'Admin enters command',
  'AI creates implementation plan',
  'AI creates GitHub branch',
  'AI edits files through controlled patch',
  'AI commits the branch change',
  'AI opens a pull request to main',
  'GitHub Actions run npm run build and cd functions && npm run build',
  'Merge only after checks pass',
  'Firebase Production Deploy runs from main',
  'Admin receives final deployment report and rollback SHA',
];

const guardrails = [
  'Admin-only and never available to owners, tenants, or technicians.',
  'Every AI action creates an audit log before execution.',
  'Every code change must happen through a GitHub branch and pull request.',
  'Deployment only runs from main after GitHub Actions pass.',
  'No direct production Firestore mutation unless an approved migration script is used.',
  'Rollback plan, command history, PR link, build status, deployment status, and error logs are mandatory.',
];

const defaultCommand = `Create a safe GitHub branch.
Prepare the implementation plan first.
Modify only approved files.
Run npm run build.
Run cd functions && npm run build.
Open a pull request to main.
Merge only after all checks pass.
Trigger Firebase Production Deploy from main.
Return final deployment report and rollback SHA.`;

function StatusPill({ label, tone = 'pending' }: { label: string; tone?: 'success' | 'warning' | 'danger' | 'pending' }) {
  const color = tone === 'success' ? '#10b981' : tone === 'warning' ? '#f59e0b' : tone === 'danger' ? '#ef4444' : binThemeTokens.gold;
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        bgcolor: alpha(color, 0.12),
        color,
        border: `1px solid ${alpha(color, 0.28)}`,
        fontWeight: 950,
        letterSpacing: 0.4,
        maxWidth: '100%',
      }}
    />
  );
}

function compactStatus(value?: string) {
  const raw = String(value || 'NOT_STARTED').trim().toUpperCase();
  const labels: Record<string, string> = {
    PENDING_IMPLEMENTATION_PLAN: 'PLAN',
    PLAN_CREATED: 'PLAN READY',
    QUEUED: 'QUEUED',
    QUEUED_FOR_GITHUB_RUNNER: 'QUEUED',
    WAITING_FOR_SECURE_BACKEND_RUNNER: 'WAITING',
    WAITING_FOR_PR: 'WAITING PR',
    WAITING_FOR_BUILD: 'BUILDING',
    READY_FOR_DEPLOY: 'READY',
    NOT_STARTED: 'NOT STARTED',
    IN_PROGRESS: 'RUNNING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    DEPLOYED: 'DEPLOYED'
  };
  return labels[raw] || raw.replaceAll('_', ' ');
}

export default function BinGptEngineerPage() {
  const { user } = useAuth();
  const [command, setCommand] = React.useState(defaultCommand);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [historyDocs, setHistoryDocs] = React.useState<any[]>([]);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const role = String(user?.role || '').toLowerCase();
  const hasAdminAccess = Boolean(user?.claims?.admin === true || user?.isAdmin === true || ENGINEER_ADMIN_ROLES.has(role));
  const { t, isRTL } = useLanguage();

  React.useEffect(() => {
    if (!hasAdminAccess) return;
    const q = query(collection(db, 'binGptEngineerCommands'), orderBy('createdAt', 'desc'), limit(20));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setHistoryDocs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        console.error("Firestore BIN-GPT Engineer command subscription failed:", error);
      }
    );
    return () => unsubscribe();
  }, [hasAdminAccess]);

  const handleRollback = async (docId: string, sha: string, prLink: string) => {
    if (!window.confirm(`Issue rollback command for deployment?\nTarget: ${docId}`)) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'binGptEngineerCommands'), {
        command: `ROLLBACK: Revert deployment for command ${docId}.\nTarget SHA: ${sha || 'previous stable'}.\nPR Reference: ${prLink || 'N/A'}.`,
        status: 'PENDING_IMPLEMENTATION_PLAN',
        executionMode: 'GITHUB_BRANCH_PR_ONLY',
        deploymentPolicy: 'MAIN_AFTER_GITHUB_ACTIONS_PASS',
        firestoreMutationPolicy: 'APPROVED_MIGRATION_ONLY',
        rollbackRequired: false,
        workflowSteps,
        guardrails,
        commandHistory: [{ status: 'PENDING_IMPLEMENTATION_PLAN', at: new Date().toISOString() }],
        buildStatus: 'NOT_STARTED',
        prLink: null,
        deploymentStatus: 'NOT_STARTED',
        errorLogs: [],
        createdBy: user?.uid || null,
        createdByEmail: user?.email || null,
        createdByRole: role || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        auditTrail: [
          {
            action: 'ROLLBACK_COMMAND_ISSUED',
            actorUid: user?.uid || null,
            actorEmail: user?.email || null,
            actorRole: role || null,
            targetCommand: docId,
            at: new Date().toISOString(),
          },
        ],
      });
      alert('Rollback command added to the queue.');
    } catch (err: any) {
      alert('Failed to issue rollback: ' + err?.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitCommand = async () => {
    setResult(null);
    if (!hasAdminAccess) {
      setResult({ type: 'error', message: 'Access denied. BIN-GPT Engineer is restricted to admin, CEO, and approved operator roles only.' });
      return;
    }
    if (!command.trim()) {
      setResult({ type: 'error', message: 'Enter a governed engineering command before creating the audit package.' });
      return;
    }

    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'binGptEngineerCommands'), {
        command: command.trim(),
        status: 'PENDING_IMPLEMENTATION_PLAN',
        executionMode: 'GITHUB_BRANCH_PR_ONLY',
        deploymentPolicy: 'MAIN_AFTER_GITHUB_ACTIONS_PASS',
        firestoreMutationPolicy: 'APPROVED_MIGRATION_ONLY',
        rollbackRequired: true,
        workflowSteps,
        guardrails,
        commandHistory: [{ status: 'PENDING_IMPLEMENTATION_PLAN', at: new Date().toISOString() }],
        buildStatus: 'NOT_STARTED',
        prLink: null,
        deploymentStatus: 'NOT_STARTED',
        errorLogs: [],
        createdBy: user?.uid || null,
        createdByEmail: user?.email || null,
        createdByRole: role || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        auditTrail: [
          {
            action: 'COMMAND_AUDIT_PACKAGE_CREATED',
            actorUid: user?.uid || null,
            actorEmail: user?.email || null,
            actorRole: role || null,
            at: new Date().toISOString(),
          },
        ],
      });
      setResult({ type: 'success', message: `Audit package created: ${docRef.id}. Runner status: pending implementation plan.` });
    } catch (error: any) {
      setResult({ type: 'error', message: error?.message || 'Failed to create BIN-GPT Engineer audit package.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, minWidth: 0, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4} sx={{ maxWidth: 1440, mx: 'auto', minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1, minWidth: 0 }}>
            <Bot size={30} color={binThemeTokens.gold} />
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4, overflowWrap: 'anywhere' }}>
              {t('admin.bin_gpt.eyebrow')}
            </Typography>
          </Stack>
          <Typography variant="h3" fontWeight={950} sx={{ color: '#fff', lineHeight: 1.05, overflowWrap: 'anywhere' }}>
            {t('admin.bin_gpt.page_title')}
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.58)', mt: 1.5, maxWidth: 920, lineHeight: 1.8, overflowWrap: 'anywhere' }}>
            {t('admin.bin_gpt.page_desc')}
          </Typography>
        </Box>

        <Alert
          icon={<ShieldCheck size={20} />}
          severity="info"
          sx={{ bgcolor: alpha(binThemeTokens.gold, 0.08), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`, borderRadius: 3 }}
        >
          {t('admin.bin_gpt.security_alert')}
        </Alert>

        {!hasAdminAccess && (
          <Alert severity="error" sx={{ borderRadius: 3 }}>
            {t('admin.bin_gpt.access_blocked')}
          </Alert>
        )}

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Card sx={{ bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 4, height: '100%', minWidth: 0 }}>
              <CardContent sx={{ p: { xs: 2.5, md: 4 }, minWidth: 0 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                  <ScrollText size={22} color={binThemeTokens.gold} />
                  <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', overflowWrap: 'anywhere' }}>
                    {t('admin.bin_gpt.command_section_title')}
                  </Typography>
                </Stack>
                <TextField
                  multiline
                  minRows={10}
                  fullWidth
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder={t('admin.bin_gpt.command_placeholder')}
                  sx={{
                    '& .MuiInputBase-root': {
                      bgcolor: 'rgba(2,6,23,0.72)',
                      color: '#fff',
                      borderRadius: 3,
                      alignItems: 'flex-start',
                    },
                    '& textarea': { fontFamily: 'monospace', fontSize: 13, lineHeight: 1.7 },
                  }}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    disabled={!hasAdminAccess || submitting}
                    onClick={submitCommand}
                    startIcon={<Rocket size={18} />}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 999 }}
                  >
                    {t('admin.bin_gpt.create_package_btn')}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<RotateCcw size={18} />}
                    onClick={() => setCommand(defaultCommand)}
                    sx={{ borderColor: alpha(binThemeTokens.gold, 0.45), color: binThemeTokens.gold, fontWeight: 900, borderRadius: 999 }}
                  >
                    {t('admin.bin_gpt.reset_template_btn')}
                  </Button>
                </Stack>
                {submitting && <LinearProgress sx={{ mt: 2, bgcolor: alpha(binThemeTokens.gold, 0.12), '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />}
                {result && <Alert severity={result.type} sx={{ mt: 2, borderRadius: 3 }}>{result.message}</Alert>}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Card sx={{ bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${alpha('#10b981', 0.16)}`, borderRadius: 4, height: '100%', minWidth: 0 }}>
              <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                  <GitBranch size={22} color="#10b981" />
                  <Typography variant="h5" fontWeight={950} sx={{ color: '#fff' }}>{t('admin.bin_gpt.required_workflow_title')}</Typography>
                </Stack>
                <Stack spacing={1.15}>
                  {workflowSteps.map((step, index) => (
                    <Stack key={step} direction="row" spacing={1.5} alignItems="flex-start" sx={{ minWidth: 0 }}>
                      <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, display: 'grid', placeItems: 'center', fontWeight: 950, flexShrink: 0, fontSize: 12 }}>
                        {index + 1}
                      </Box>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, overflowWrap: 'anywhere' }}>
                        {step}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          {[
            { title: t('admin.bin_gpt.card_pr_title'), text: t('admin.bin_gpt.card_pr_text'), icon: <GitPullRequest color={binThemeTokens.gold} />, pill: <StatusPill label={t('admin.bin_gpt.card_pr_pill')} /> },
            { title: t('admin.bin_gpt.card_build_title'), text: t('admin.bin_gpt.card_build_text'), icon: <CheckCircle2 color="#10b981" />, pill: <StatusPill label={t('admin.bin_gpt.card_build_pill')} tone="success" /> },
            { title: t('admin.bin_gpt.card_audit_title'), text: t('admin.bin_gpt.card_audit_text'), icon: <History color="#f59e0b" />, pill: <StatusPill label={t('admin.bin_gpt.card_audit_pill')} tone="warning" /> },
            { title: t('admin.bin_gpt.card_mutation_title'), text: t('admin.bin_gpt.card_mutation_text'), icon: <AlertTriangle color="#ef4444" />, pill: <StatusPill label={t('admin.bin_gpt.card_mutation_pill')} tone="danger" /> },
          ].map((card) => (
            <Grid item xs={12} md={6} lg={3} key={card.title}>
              <Card sx={{ bgcolor: 'rgba(2,6,23,0.86)', border: `1px solid ${alpha(binThemeTokens.gold, 0.14)}`, borderRadius: 4, height: '100%', minWidth: 0 }}>
                <CardContent>
                  {card.icon}
                  <Typography variant="h6" fontWeight={950} sx={{ color: '#fff', mt: 2, overflowWrap: 'anywhere' }}>{card.title}</Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)', mt: 1, overflowWrap: 'anywhere' }}>{card.text}</Typography>
                  <Box sx={{ mt: 2 }}>{card.pill}</Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Card sx={{ bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 4 }}>
          <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
            <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', mb: 2 }}>{t('admin.bin_gpt.security_rules_title')}</Typography>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
            <Grid container spacing={2}>
              {guardrails.map((rule) => (
                <Grid item xs={12} md={6} key={rule}>
                  <Stack direction="row" spacing={1.2} alignItems="flex-start" sx={{ minWidth: 0 }}>
                    <ShieldCheck size={18} color={binThemeTokens.gold} style={{ marginTop: 2, flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.65, overflowWrap: 'anywhere' }}>
                      {rule}
                    </Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>

        <Card sx={{ bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 4 }}>
          <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
              <History size={22} color={binThemeTokens.gold} />
              <Typography variant="h5" fontWeight={950} sx={{ color: '#fff' }}>{t('admin.bin_gpt.history_title')}</Typography>
            </Stack>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
            
            <TableContainer sx={{ overflowX: 'auto', pb: 1 }}>
              <Table size="small" sx={{ minWidth: 980, tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    <TableCell style={{ width: 50 }} />
                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, width: 160 }}>{t('admin.bin_gpt.col_date')}</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, width: 280 }}>{t('admin.bin_gpt.col_command')}</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, width: 120 }}>{t('admin.bin_gpt.col_status')}</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, width: 120 }}>{t('admin.bin_gpt.col_build')}</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, width: 120 }}>{t('admin.bin_gpt.col_deploy')}</TableCell>
                    <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900, width: 130 }}>{t('admin.bin_gpt.col_actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyDocs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'rgba(255,255,255,0.5)' }}>{t('admin.bin_gpt.empty_state')}</TableCell>
                    </TableRow>
                  )}
                  {historyDocs.map((docItem) => {
                    const isExpanded = expandedId === docItem.id;
                    const dateStr = docItem.createdAt?.toDate ? docItem.createdAt.toDate().toLocaleString() : 'Just now';
                    const isDeployed = docItem.deploymentStatus === 'SUCCESS';
                    return (
                      <React.Fragment key={docItem.id}>
                        <TableRow sx={{ '& td': { borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.05)' } }}>
                          <TableCell sx={{ width: 50 }}>
                            <IconButton size="small" onClick={() => setExpandedId(isExpanded ? null : docItem.id)} sx={{ color: 'rgba(255,255,255,0.5)' }}>
                              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </IconButton>
                          </TableCell>
                          <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>{dateStr}</TableCell>
                          <TableCell sx={{ color: '#fff', maxWidth: 280, overflow: 'hidden' }}>
                            <Typography noWrap variant="body2" title={docItem.command}>{docItem.command}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={compactStatus(docItem.status)} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontSize: '0.65rem', fontWeight: 900 }} />
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={compactStatus(docItem.buildStatus)} sx={{ bgcolor: docItem.buildStatus === 'SUCCESS' ? alpha('#10b981', 0.1) : docItem.buildStatus === 'FAILED' ? alpha('#ef4444', 0.1) : 'rgba(255,255,255,0.05)', color: docItem.buildStatus === 'SUCCESS' ? '#10b981' : docItem.buildStatus === 'FAILED' ? '#ef4444' : '#fff', fontSize: '0.65rem', fontWeight: 900 }} />
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={compactStatus(docItem.deploymentStatus)} sx={{ bgcolor: isDeployed ? alpha('#10b981', 0.1) : docItem.deploymentStatus === 'FAILED' ? alpha('#ef4444', 0.1) : 'rgba(255,255,255,0.05)', color: isDeployed ? '#10b981' : docItem.deploymentStatus === 'FAILED' ? '#ef4444' : '#fff', fontSize: '0.65rem', fontWeight: 900 }} />
                          </TableCell>
                          <TableCell align="right">
                            {docItem.prLink && (
                              <Button size="small" variant="text" href={docItem.prLink} target="_blank" endIcon={<ExternalLink size={14} />} sx={{ color: '#3b82f6', minWidth: 0, mr: 1 }}>PR</Button>
                            )}
                            {isDeployed && (
                              <Button size="small" variant="outlined" color="error" onClick={() => handleRollback(docItem.id, docItem.rollbackSha || '', docItem.prLink)} startIcon={<RotateCcw size={14} />} sx={{ borderRadius: 2 }}>ROLLBACK</Button>
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                              <Box sx={{ margin: 2, p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, mb: 1, fontWeight: 900 }}>{t('admin.bin_gpt.detail_command')}</Typography>
                                <Typography variant="body2" sx={{ color: '#fff', whiteSpace: 'pre-wrap', mb: 2, fontFamily: 'monospace', fontSize: '0.8rem' }}>{docItem.command}</Typography>
                                
                                <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, mb: 1, fontWeight: 900 }}>{t('admin.bin_gpt.detail_audit_trail')}</Typography>
                                <Stack spacing={1}>
                                  {docItem.auditTrail?.map((audit: any, idx: number) => (
                                    <Stack direction="row" spacing={1} key={idx} alignItems="center">
                                      <GitCommit size={14} color="rgba(255,255,255,0.3)" />
                                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                        <strong style={{ color: '#fff' }}>{audit.at ? new Date(audit.at).toLocaleTimeString() : 'N/A'}:</strong> {audit.action} by {audit.actorEmail}
                                      </Typography>
                                    </Stack>
                                  ))}
                                </Stack>
                                
                                {docItem.errorLogs && (Array.isArray(docItem.errorLogs) ? docItem.errorLogs.length > 0 : String(docItem.errorLogs).trim().length > 0) && (
                                  <Box sx={{ mt: 2, p: 2, bgcolor: alpha('#ef4444', 0.1), borderRadius: 2, border: `1px solid ${alpha('#ef4444', 0.2)}` }}>
                                    <Typography variant="subtitle2" sx={{ color: '#ef4444', fontWeight: 900, mb: 1 }}>{t('admin.bin_gpt.detail_error_logs')}</Typography>
                                    {Array.isArray(docItem.errorLogs) ? (
                                      docItem.errorLogs.map((err: string, i: number) => (
                                        <Typography key={i} variant="caption" sx={{ color: '#fca5a5', display: 'block', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{err}</Typography>
                                      ))
                                    ) : (
                                      <Typography variant="caption" sx={{ color: '#fca5a5', display: 'block', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{String(docItem.errorLogs)}</Typography>
                                    )}
                                  </Box>
                                )}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
