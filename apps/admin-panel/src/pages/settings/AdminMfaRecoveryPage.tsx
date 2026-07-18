import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { KeyRound, RefreshCcw, ShieldAlert, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { binThemeTokens } from '../../theme/adminTheme';

type RecoveryRequest = {
  requestId: string;
  status: string;
  targetUid: string;
  targetEmailMasked: string;
  targetDisplayName: string;
  targetRole: string;
  incidentReference: string;
  reason: string;
  factorCountBefore: number;
  firstApproverUid: string;
  firstApproverDisplayName: string;
  secondApproverUid: string;
  createdAtMs: number;
  expiresAtMs: number;
  completedAtMs: number;
};

type Notice = { severity: 'success' | 'error' | 'warning' | 'info'; text: string };

const formatDate = (value: number, locale: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const statusColor = (status: string): 'default' | 'warning' | 'info' | 'success' | 'error' => {
  if (status === 'COMPLETED') return 'success';
  if (status === 'FAILED' || status === 'EXPIRED') return 'error';
  if (status === 'EXECUTING') return 'info';
  if (status === 'PENDING_SECOND_APPROVAL') return 'warning';
  return 'default';
};

export default function AdminMfaRecoveryPage() {
  const { isRTL } = useLanguage();
  const { user } = useAuth();
  const copy = React.useCallback((en: string, ar: string) => (isRTL ? ar : en), [isRTL]);
  const locale = isRTL ? 'ar-AE' : 'en-AE';
  const [requests, setRequests] = React.useState<RecoveryRequest[]>([]);
  const [targetEmail, setTargetEmail] = React.useState('');
  const [incidentReference, setIncidentReference] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState('');
  const [notice, setNotice] = React.useState<Notice | null>(null);

  const loadRequests = React.useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const callable = httpsCallable(functions, 'listAdminMfaRecoveryRequests');
      const result = await callable({});
      setRequests(((result.data as any)?.requests || []) as RecoveryRequest[]);
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || copy('Could not load MFA recovery requests.', 'تعذر تحميل طلبات استعادة المصادقة متعددة العوامل.') });
    } finally {
      setLoading(false);
    }
  }, [copy]);

  React.useEffect(() => { void loadRequests(); }, [loadRequests]);

  const createRequest = async () => {
    if (!targetEmail.trim() || incidentReference.trim().length < 6 || reason.trim().length < 20) {
      setNotice({ severity: 'warning', text: copy('Enter the target email, a valid incident reference, and a reason of at least 20 characters.', 'أدخل بريد المسؤول المستهدف ومرجع حادث صالح وسبباً لا يقل عن 20 حرفاً.') });
      return;
    }
    setBusy('create');
    setNotice(null);
    try {
      const callable = httpsCallable(functions, 'createAdminMfaRecoveryRequest');
      const result = await callable({
        targetEmail: targetEmail.trim().toLowerCase(),
        incidentReference: incidentReference.trim().toUpperCase(),
        reason: reason.trim(),
      });
      const data = result.data as any;
      setTargetEmail('');
      setIncidentReference('');
      setReason('');
      setNotice({ severity: 'success', text: copy(`Recovery request ${data?.requestId || ''} now requires a second distinct approver.`, `طلب الاستعادة ${data?.requestId || ''} يتطلب الآن موافقة مسؤول ثانٍ مختلف.`) });
      await loadRequests();
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || copy('Could not create the recovery request.', 'تعذر إنشاء طلب الاستعادة.') });
    } finally {
      setBusy('');
    }
  };

  const approveRequest = async (requestId: string) => {
    setBusy(requestId);
    setNotice(null);
    try {
      const callable = httpsCallable(functions, 'approveAdminMfaRecoveryRequest');
      const result = await callable({ requestId });
      const data = result.data as any;
      setNotice({
        severity: 'success',
        text: data?.idempotent
          ? copy('This recovery was already completed.', 'تم إكمال هذا الاسترداد بالفعل.')
          : copy('MFA factors were removed, refresh tokens revoked, and re-enrollment is now required.', 'تمت إزالة عوامل المصادقة وإلغاء رموز التحديث وأصبحت إعادة التسجيل مطلوبة.'),
      });
      await loadRequests();
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || copy('Could not approve this recovery request.', 'تعذر اعتماد طلب الاستعادة هذا.') });
    } finally {
      setBusy('');
    }
  };

  return (
    <Container data-testid="admin-mfa-recovery-page" maxWidth="xl" sx={{ py: 4 }} dir={isRTL ? 'rtl' : 'ltr'}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={2}>
          <Box>
            <Typography variant="overline" color={binThemeTokens.gold} fontWeight={900} letterSpacing={2}>
              {copy('PRIVILEGED ACCOUNT RECOVERY', 'استعادة الحسابات ذات الصلاحيات')}
            </Typography>
            <Typography variant="h4" fontWeight={950} color="white">
              {copy('Two-Approver MFA Recovery', 'استعادة المصادقة بموافقة مسؤولين')}
            </Typography>
            <Typography color="text.secondary">
              {copy('Only distinct MFA-verified CEO or Super Admin accounts can remove a lost second factor.', 'لا يمكن إزالة عامل ثانٍ مفقود إلا بواسطة حسابين مختلفين للرئيس التنفيذي أو المسؤول الأعلى بعد التحقق متعدد العوامل.')}
            </Typography>
          </Box>
          <Button data-testid="admin-mfa-recovery-refresh" startIcon={<RefreshCcw size={18} />} variant="outlined" onClick={() => void loadRequests()} disabled={loading || Boolean(busy)}>
            {copy('Refresh', 'تحديث')}
          </Button>
        </Stack>

        <Alert severity="warning" icon={<ShieldAlert size={20} />}>
          {copy(
            'This workflow removes all existing second factors and revokes refresh tokens. It must be tied to a verified incident and cannot be initiated or second-approved by the target Admin.',
            'تزيل هذه العملية جميع عوامل المصادقة الثانية الحالية وتلغي رموز التحديث. يجب ربطها بحادث موثق ولا يجوز للمسؤول المستهدف بدء الطلب أو تقديم الموافقة الثانية.',
          )}
        </Alert>
        {notice && <Alert data-testid="admin-mfa-recovery-notice" severity={notice.severity} onClose={() => setNotice(null)}>{notice.text}</Alert>}

        <Paper sx={{ p: 3, borderRadius: 4 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <KeyRound color={binThemeTokens.gold} />
              <Box>
                <Typography fontWeight={950}>{copy('Start a controlled recovery', 'بدء استعادة محكومة')}</Typography>
                <Typography variant="body2" color="text.secondary">{copy('Your MFA-verified approval becomes the first approval.', 'تُسجل موافقتك الموثقة بالمصادقة متعددة العوامل كموافقة أولى.')}</Typography>
              </Box>
            </Stack>
            <Divider />
            <Stack direction={{ xs: 'column', lg: isRTL ? 'row-reverse' : 'row' }} spacing={2} alignItems="stretch">
              <TextField data-testid="admin-mfa-recovery-target-email" fullWidth label={copy('Target Admin email', 'بريد المسؤول المستهدف')} value={targetEmail} onChange={(event) => setTargetEmail(event.target.value)} inputProps={{ maxLength: 240 }} />
              <TextField data-testid="admin-mfa-recovery-incident" fullWidth label={copy('Incident / support reference', 'مرجع الحادث أو الدعم')} value={incidentReference} onChange={(event) => setIncidentReference(event.target.value)} inputProps={{ maxLength: 120 }} />
            </Stack>
            <TextField data-testid="admin-mfa-recovery-reason" fullWidth multiline minRows={3} label={copy('Why factor recovery is required', 'سبب الحاجة إلى استعادة العامل')} value={reason} onChange={(event) => setReason(event.target.value)} inputProps={{ maxLength: 1200 }} helperText={`${reason.trim().length}/1200`} />
            <Button data-testid="admin-mfa-recovery-create" variant="contained" color="warning" startIcon={busy === 'create' ? <CircularProgress size={18} /> : <ShieldCheck size={18} />} disabled={Boolean(busy)} onClick={createRequest}>
              {copy('Record First Approval', 'تسجيل الموافقة الأولى')}
            </Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 3, borderRadius: 4 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
            <UserRoundCheck color={binThemeTokens.gold} />
            <Typography fontWeight={950}>{copy('Recovery queue and immutable history', 'قائمة الاستعادة والسجل غير القابل للتغيير')}</Typography>
          </Stack>
          {loading ? (
            <Stack alignItems="center" py={5}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Stack>
          ) : (
            <Stack spacing={2}>
              {requests.map((item) => {
                const maySecondApprove = item.status === 'PENDING_SECOND_APPROVAL' && item.firstApproverUid !== user?.uid;
                return (
                  <Box data-testid={`admin-mfa-recovery-request-${item.requestId}`} key={item.requestId} sx={{ p: 2.5, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
                    <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" gap={2}>
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                          <Typography fontWeight={950}>{item.targetDisplayName || item.targetEmailMasked}</Typography>
                          <Chip size="small" label={item.targetRole || 'admin'} />
                          <Chip size="small" color={statusColor(item.status)} label={item.status.replace(/_/g, ' ')} />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" mt={0.5}>{item.targetEmailMasked} · {item.incidentReference}</Typography>
                        <Typography variant="body2" mt={1}>{item.reason}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                          {copy('First approver', 'الموافق الأول')}: {item.firstApproverDisplayName || item.firstApproverUid} · {copy('Factors', 'العوامل')}: {item.factorCountBefore}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {copy('Created', 'أُنشئ')}: {formatDate(item.createdAtMs, locale)} · {copy('Expires', 'ينتهي')}: {formatDate(item.expiresAtMs, locale)}
                        </Typography>
                      </Box>
                      <Stack justifyContent="center" minWidth={{ md: 220 }}>
                        {maySecondApprove ? (
                          <Button data-testid={`admin-mfa-recovery-approve-${item.requestId}`} variant="contained" color="error" disabled={Boolean(busy)} onClick={() => void approveRequest(item.requestId)}>
                            {busy === item.requestId ? <CircularProgress size={18} /> : copy('Provide Second Approval', 'تقديم الموافقة الثانية')}
                          </Button>
                        ) : (
                          <Typography variant="caption" color="text.secondary" textAlign={isRTL ? 'right' : 'left'}>
                            {item.status === 'PENDING_SECOND_APPROVAL' && item.firstApproverUid === user?.uid
                              ? copy('A different approved administrator must complete this request.', 'يجب أن يكمل هذا الطلب مسؤول معتمد آخر.')
                              : copy('No action available for this request.', 'لا يوجد إجراء متاح لهذا الطلب.')}
                          </Typography>
                        )}
                      </Stack>
                    </Stack>
                  </Box>
                );
              })}
              {requests.length === 0 && <Typography color="text.secondary" textAlign="center" py={4}>{copy('No MFA recovery requests have been recorded.', 'لم يتم تسجيل أي طلبات لاستعادة المصادقة متعددة العوامل.')}</Typography>}
            </Stack>
          )}
        </Paper>
      </Stack>
    </Container>
  );
}
