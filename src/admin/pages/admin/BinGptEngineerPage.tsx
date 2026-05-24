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
import { addDoc, collection, db, serverTimestamp, onSnapshot, query, orderBy, limit } from '@/lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { binThemeTokens } from '../../theme/adminTheme';

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

export default function BinGptEngineerPage() {
  const { user } = useAuth();
  const [command, setCommand] = React.useState(defaultCommand);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [historyDocs, setHistoryDocs] = React.useState<any[]>([]);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const role = String(user?.role || '').toLowerCase();
  const hasAdminAccess = Boolean(user?.claims?.admin === true || user?.isAdmin === true || ENGINEER_ADMIN_ROLES.has(role));

  React.useEffect(() => {
    if (!hasAdminAccess) return;
    const q = query(collection(db, 'binGptEngineerCommands'), orderBy('createdAt', 'desc'), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistoryDocs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [hasAdminAccess]);

  const handleRollback = async (docId: string, sha: string, prLink: string) => {
    if (!window.confirm(`Issue rollback command for deployment?\\nTarget: ${docId}`)) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'binGptEngineerCommands'), {
        command: `ROLLBACK: Revert deployment for command ${docId}.\\nTarget SHA: ${sha || 'previous stable'}.\\nPR Reference: ${prLink || 'N/A'}.`,
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
    <Box sx={{ p: { xs: 2, md: 4 }, minWidth: 0 }}>
      <Stack spacing={4} sx={{ maxWidth: 1440, mx: 'auto', minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1, minWidth: 0 }}>
            <Bot size={30} color={binThemeTokens.gold} />
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4, overflowWrap: 'anywhere' }}>
              ADMIN AI STUDIO
            </Typography>
          </Stack>
          <Typography variant="h3" fontWeight={950} sx={{ color: '#fff', lineHeight: 1.05, overflowWrap: 'anywhere' }}>
            BIN-GPT Engineer™
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.58)', mt: 1.5, maxWidth: 920, lineHeight: 1.8, overflowWrap: 'anywhere' }}>
            Secure command center for branch-based code changes, PR validation, Firebase production deployment governance, rollback control, command history, and immutable audit logging.
          </Typography>
        </Box>

        <Alert
          icon={<ShieldCheck size={20} />}
          severity="info"
          sx={{ bgcolor: alpha(binThemeTokens.gold, 0.08), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}`, borderRadius: 3 }}
        >
          Browser clients only create governed command records. GitHub tokens, Firebase service credentials, merge rights, and production deployment rights must stay in GitHub Actions or backend runners.
        </Alert>

        {!hasAdminAccess && (
          <Alert severity="error" sx={{ borderRadius: 3 }}>
            This page is blocked for the current session. Owners, tenants, technicians, and non-admin users must never access BIN-GPT Engineer™.
          </Alert>
        )}

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Card sx={{ bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 4, height: '100%', minWidth: 0 }}>
              <CardContent sx={{ p: { xs: 2.5, md: 4 }, minWidth: 0 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                  <ScrollText size={22} color={binThemeTokens.gold} />
                  <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', overflowWrap: 'anywhere' }}>
                    Secure Engineering Command
                  </Typography>
                </Stack>
                <TextField
                  multiline
                  minRows={10}
                  fullWidth
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="Enter the governed engineering command..."
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
                    Create Audit Package
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<RotateCcw size={18} />}
                    onClick={() => setCommand(defaultCommand)}
                    sx={{ borderColor: alpha(binThemeTokens.gold, 0.45), color: binThemeTokens.gold, fontWeight: 900, borderRadius: 999 }}
                  >
                    Reset Template
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
                  <Typography variant="h5" fontWeight={950} sx={{ color: '#fff' }}>Required Workflow</Typography>
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
            { title: 'PR Governance', text: 'Branch and PR are mandatory. Direct main commits are blocked by policy.', icon: <GitPullRequest color={binThemeTokens.gold} />, pill: <StatusPill label="BRANCH + PR ONLY" /> },
            { title: 'Build Gate', text: 'Root build and Functions build must pass before merge and production deploy.', icon: <CheckCircle2 color="#10b981" />, pill: <StatusPill label="CHECKS REQUIRED" tone="success" /> },
            { title: 'Audit History', text: 'Command, actor, status, PR, deploy logs, and errors are written to Firestore.', icon: <History color="#f59e0b" />, pill: <StatusPill label="AUDIT FIRST" tone="warning" /> },
            { title: 'No Direct Mutation', text: 'Production Firestore changes require approved migration scripts and rollback plan.', icon: <AlertTriangle color="#ef4444" />, pill: <StatusPill label="LOCKED" tone="danger" /> },
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
            <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', mb: 2 }}>Security Rules Embedded in Studio</Typography>
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
              <Typography variant="h5" fontWeight={950} sx={{ color: '#fff' }}>AI Action History & Deployments</Typography>
            </Stack>
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2 }} />
            
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell />
                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>DATE</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>COMMAND</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>STATUS</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>BUILD</TableCell>
                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>DEPLOY</TableCell>
                    <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>ACTIONS</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyDocs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'rgba(255,255,255,0.5)' }}>No engineering commands found.</TableCell>
                    </TableRow>
                  )}
                  {historyDocs.map((docItem) => {
                    const isExpanded = expandedId === docItem.id;
                    const dateStr = docItem.createdAt?.toDate ? docItem.createdAt.toDate().toLocaleString() : 'Just now';
                    const isDeployed = docItem.deploymentStatus === 'SUCCESS';
                    return (
                      <React.Fragment key={docItem.id}>
                        <TableRow sx={{ '& td': { borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.05)' } }}>
                          <TableCell sx={{ width: 40 }}>
                            <IconButton size="small" onClick={() => setExpandedId(isExpanded ? null : docItem.id)} sx={{ color: 'rgba(255,255,255,0.5)' }}>
                              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </IconButton>
                          </TableCell>
                          <TableCell sx={{ color: '#fff', fontSize: '0.8rem' }}>{dateStr}</TableCell>
                          <TableCell sx={{ color: '#fff', maxWidth: 200 }}>
                            <Typography noWrap variant="body2">{docItem.command}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={docItem.status} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontSize: '0.65rem', fontWeight: 900 }} />
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={docItem.buildStatus} sx={{ bgcolor: docItem.buildStatus === 'SUCCESS' ? alpha('#10b981', 0.1) : docItem.buildStatus === 'FAILED' ? alpha('#ef4444', 0.1) : 'rgba(255,255,255,0.05)', color: docItem.buildStatus === 'SUCCESS' ? '#10b981' : docItem.buildStatus === 'FAILED' ? '#ef4444' : '#fff', fontSize: '0.65rem', fontWeight: 900 }} />
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={docItem.deploymentStatus} sx={{ bgcolor: isDeployed ? alpha('#10b981', 0.1) : docItem.deploymentStatus === 'FAILED' ? alpha('#ef4444', 0.1) : 'rgba(255,255,255,0.05)', color: isDeployed ? '#10b981' : docItem.deploymentStatus === 'FAILED' ? '#ef4444' : '#fff', fontSize: '0.65rem', fontWeight: 900 }} />
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
                                <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, mb: 1, fontWeight: 900 }}>Command Detail</Typography>
                                <Typography variant="body2" sx={{ color: '#fff', whiteSpace: 'pre-wrap', mb: 2, fontFamily: 'monospace', fontSize: '0.8rem' }}>{docItem.command}</Typography>
                                
                                <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, mb: 1, fontWeight: 900 }}>Audit Trail</Typography>
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
                                
                                {docItem.errorLogs && docItem.errorLogs.length > 0 && (
                                  <Box sx={{ mt: 2, p: 2, bgcolor: alpha('#ef4444', 0.1), borderRadius: 2, border: `1px solid ${alpha('#ef4444', 0.2)}` }}>
                                    <Typography variant="subtitle2" sx={{ color: '#ef4444', fontWeight: 900, mb: 1 }}>Error Logs</Typography>
                                    {docItem.errorLogs.map((err: string, i: number) => (
                                      <Typography key={i} variant="caption" sx={{ color: '#fca5a5', display: 'block', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{err}</Typography>
                                    ))}
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
