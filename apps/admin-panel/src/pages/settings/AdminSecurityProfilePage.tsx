import React from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { KeyRound, LockKeyhole, MonitorSmartphone, RefreshCcw, ShieldCheck, UserRound } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminMfaEnrollmentCard from '../../components/security/AdminMfaEnrollmentCard';

type SessionRecord = {
  sessionId: string;
  current: boolean;
  userAgent: string;
  deviceHash: string;
  createdAtMs: number;
  lastSeenAtMs: number;
  expiresAtMs: number;
  status: string;
};

type SecurityEvent = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAtMs: number;
};

type SecurityProfile = {
  uid: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  phoneNumber: string;
  photoURL: string;
  role: string;
  claims: Record<string, unknown>;
  disabled: boolean;
  mfa: {
    enrolled: boolean;
    factorCount: number;
    factors: Array<{ uid: string; displayName: string | null; factorId: string; enrollmentTime: string | null }>;
  };
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
    lastRefreshTime?: string;
    tokensValidAfterTime?: string;
  };
  assignedRegion: string;
  permissions: Record<string, unknown>;
  modules: unknown[];
  sessions: SessionRecord[];
  securityEvents: SecurityEvent[];
};

const formatDate = (value: string | number | undefined, locale: string) => {
  if (!value) return '—';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export default function AdminSecurityProfilePage() {
  const { isRTL } = useLanguage();
  const { user, logout, mfaEnrollmentRequired } = useAuth();
  const copy = React.useCallback((en: string, ar: string) => (isRTL ? ar : en), [isRTL]);
  const locale = isRTL ? 'ar-AE' : 'en-AE';
  const [profile, setProfile] = React.useState<SecurityProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [revokeConfirmation, setRevokeConfirmation] = React.useState('');
  const [lockConfirmation, setLockConfirmation] = React.useState('');
  const [lockReason, setLockReason] = React.useState('');

  const loadProfile = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let sessionId = sessionStorage.getItem('bin-admin-security-session') || '';
      if (!sessionId) {
        const register = httpsCallable(functions, 'registerAdminSecuritySession');
        const registered = await register({ language: isRTL ? 'ar' : 'en' });
        const data = registered.data as { sessionId?: string };
        sessionId = data.sessionId || '';
        if (sessionId) sessionStorage.setItem('bin-admin-security-session', sessionId);
      }
      const callable = httpsCallable(functions, 'getAdminSecurityProfile');
      const result = await callable({ sessionId });
      setProfile(result.data as SecurityProfile);
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : String(profileError));
    } finally {
      setLoading(false);
    }
  }, [isRTL]);

  React.useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const revokeAllSessions = async () => {
    if (revokeConfirmation !== 'REVOKE_ALL_ADMIN_SESSIONS') return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const callable = httpsCallable(functions, 'revokeAdminSessions');
      await callable({ confirmation: revokeConfirmation });
      sessionStorage.removeItem('bin-admin-security-session');
      setSuccess(copy('All Admin sessions were revoked. Sign in again.', 'تم إلغاء جميع جلسات المسؤول. سجّل الدخول مرة أخرى.'));
      await logout();
      window.location.href = '/login';
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : String(revokeError));
    } finally {
      setBusy(false);
    }
  };

  const emergencyLock = async () => {
    if (lockConfirmation !== 'LOCK_MY_ADMIN_ACCOUNT' || lockReason.trim().length < 8) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const callable = httpsCallable(functions, 'lockOwnAdminAccount');
      await callable({ confirmation: lockConfirmation, reason: lockReason.trim() });
      sessionStorage.removeItem('bin-admin-security-session');
      await logout();
      window.location.href = '/login';
    } catch (lockError) {
      setError(lockError instanceof Error ? lockError.message : String(lockError));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Box minHeight="60vh" display="flex" alignItems="center" justifyContent="center" dir={isRTL ? 'rtl' : 'ltr'}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress sx={{ color: binThemeTokens.gold }} />
          <Typography color="text.secondary">{copy('Loading authoritative security profile…', 'جارٍ تحميل ملف الأمان المعتمد…')}</Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }} dir={isRTL ? 'rtl' : 'ltr'}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={2}>
          <Box>
            <Typography variant="overline" color={binThemeTokens.gold} fontWeight={900} letterSpacing={2}>
              {copy('ADMIN IDENTITY & SECURITY', 'هوية وأمان المسؤول')}
            </Typography>
            <Typography variant="h4" fontWeight={950} color="white">
              {copy('Personal Security Profile', 'ملف الأمان الشخصي')}
            </Typography>
            <Typography color="text.secondary">
              {copy('Firebase Auth, custom claims, MFA, sessions and security history are server-derived.', 'بيانات Firebase Auth والمطالبات وMFA والجلسات وسجل الأمان مستمدة من الخادم.')}
            </Typography>
          </Box>
          <Button startIcon={<RefreshCcw size={18} />} onClick={() => void loadProfile()} disabled={busy} variant="outlined">
            {copy('Refresh', 'تحديث')}
          </Button>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}
        {mfaEnrollmentRequired && (
          <Alert severity="warning" data-testid="admin-mfa-enrollment-required">
            {copy(
              'Admin access is restricted to this profile until Firebase MFA enrollment is completed. After enrollment, sign in again and verify the second factor.',
              'يقتصر وصول المسؤول على هذا الملف حتى اكتمال تسجيل مصادقة Firebase متعددة العوامل. بعد التسجيل، سجّل الدخول مرة أخرى وتحقق من العامل الثاني.',
            )}
          </Alert>
        )}

        <AdminMfaEnrollmentCard
          enrolled={profile?.mfa.enrolled === true}
          currentPhone={profile?.phoneNumber || ''}
          isRTL={isRTL}
          onEnrolled={loadProfile}
        />

        <Grid container spacing={3}>
          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: 3, borderRadius: 4, height: '100%' }}>
              <Stack spacing={3}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Avatar src={profile?.photoURL || undefined} sx={{ width: 72, height: 72, bgcolor: binThemeTokens.gold, color: '#020617' }}>
                    {(profile?.displayName || user?.displayName || 'A').slice(0, 1).toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography variant="h5" fontWeight={950}>{profile?.displayName || user?.displayName || copy('Administrator', 'مسؤول')}</Typography>
                    <Typography color="text.secondary">{profile?.email || user?.email}</Typography>
                    <Stack direction="row" spacing={1} mt={1} flexWrap="wrap" useFlexGap>
                      <Chip size="small" icon={<ShieldCheck size={14} />} label={profile?.role || user?.role || 'admin'} color="primary" />
                      <Chip size="small" label={profile?.emailVerified ? copy('Email verified', 'البريد موثّق') : copy('Email unverified', 'البريد غير موثّق')} color={profile?.emailVerified ? 'success' : 'warning'} />
                      <Chip size="small" label={profile?.disabled ? copy('Disabled', 'معطّل') : copy('Active', 'نشط')} color={profile?.disabled ? 'error' : 'success'} />
                    </Stack>
                  </Box>
                </Stack>
                <Divider />
                <Stack spacing={1.5}>
                  <Typography fontWeight={900}>{copy('Authoritative identity', 'الهوية المعتمدة')}</Typography>
                  <Typography variant="body2"><strong>UID:</strong> {profile?.uid || user?.uid}</Typography>
                  <Typography variant="body2"><strong>{copy('Phone', 'الهاتف')}:</strong> {profile?.phoneNumber || '—'}</Typography>
                  <Typography variant="body2"><strong>{copy('Operating region', 'منطقة التشغيل')}:</strong> {profile?.assignedRegion || '—'}</Typography>
                  <Typography variant="body2"><strong>{copy('Created', 'تاريخ الإنشاء')}:</strong> {formatDate(profile?.metadata.creationTime, locale)}</Typography>
                  <Typography variant="body2"><strong>{copy('Last sign-in', 'آخر تسجيل دخول')}:</strong> {formatDate(profile?.metadata.lastSignInTime, locale)}</Typography>
                  <Typography variant="body2"><strong>{copy('Tokens valid after', 'صلاحية الرموز بعد')}:</strong> {formatDate(profile?.metadata.tokensValidAfterTime, locale)}</Typography>
                </Stack>
                <Divider />
                <Stack spacing={1.5}>
                  <Typography fontWeight={900}>{copy('Custom claims', 'المطالبات المخصصة')}</Typography>
                  <Box component="pre" sx={{ m: 0, p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', overflowX: 'auto', fontSize: 12 }}>
                    {JSON.stringify(profile?.claims || {}, null, 2)}
                  </Box>
                </Stack>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={7}>
            <Stack spacing={3}>
              <Paper sx={{ p: 3, borderRadius: 4 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <KeyRound color={binThemeTokens.gold} />
                    <Box>
                      <Typography fontWeight={950}>{copy('Multi-factor authentication', 'المصادقة متعددة العوامل')}</Typography>
                      <Typography variant="body2" color="text.secondary">{copy('Enrollment is read directly from Firebase Auth.', 'تتم قراءة التسجيل مباشرة من Firebase Auth.')}</Typography>
                    </Box>
                  </Stack>
                  <Chip label={profile?.mfa.enrolled ? copy(`${profile.mfa.factorCount} factor(s)`, `${profile.mfa.factorCount} عامل`) : copy('Not enrolled', 'غير مسجّل')} color={profile?.mfa.enrolled ? 'success' : 'warning'} />
                </Stack>
                {profile?.mfa.factors?.length ? (
                  <Stack mt={2} spacing={1}>
                    {profile.mfa.factors.map((factor) => (
                      <Typography key={factor.uid} variant="body2">{factor.displayName || factor.factorId} · {factor.enrollmentTime || '—'}</Typography>
                    ))}
                  </Stack>
                ) : null}
              </Paper>

              <Paper sx={{ p: 3, borderRadius: 4 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
                  <MonitorSmartphone color={binThemeTokens.gold} />
                  <Typography fontWeight={950}>{copy('Active security sessions', 'جلسات الأمان النشطة')}</Typography>
                </Stack>
                <Stack spacing={1.5}>
                  {(profile?.sessions || []).map((session) => (
                    <Box key={session.sessionId} sx={{ p: 2, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
                      <Stack direction="row" justifyContent="space-between" gap={2}>
                        <Box>
                          <Typography variant="body2" fontWeight={900}>{session.current ? copy('Current session', 'الجلسة الحالية') : copy('Admin session', 'جلسة مسؤول')}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{session.userAgent || session.deviceHash}</Typography>
                        </Box>
                        <Chip size="small" label={session.status} color={session.current ? 'success' : 'default'} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{copy('Expires', 'تنتهي')}: {formatDate(session.expiresAtMs, locale)}</Typography>
                    </Box>
                  ))}
                  {!profile?.sessions?.length && <Typography color="text.secondary">{copy('No active registered sessions.', 'لا توجد جلسات مسجّلة نشطة.')}</Typography>}
                </Stack>
                <Divider sx={{ my: 3 }} />
                <Stack spacing={1.5}>
                  <Typography fontWeight={900}>{copy('Revoke every Admin session', 'إلغاء جميع جلسات المسؤول')}</Typography>
                  <Typography variant="body2" color="text.secondary">{copy('This revokes Firebase refresh tokens and requires a new login on every device.', 'يؤدي ذلك إلى إلغاء رموز التحديث ويفرض تسجيل دخول جديد على جميع الأجهزة.')}</Typography>
                  <TextField value={revokeConfirmation} onChange={(event) => setRevokeConfirmation(event.target.value)} label="REVOKE_ALL_ADMIN_SESSIONS" fullWidth />
                  <Button color="warning" variant="contained" disabled={busy || revokeConfirmation !== 'REVOKE_ALL_ADMIN_SESSIONS'} onClick={() => void revokeAllSessions()}>
                    {copy('Revoke all sessions', 'إلغاء جميع الجلسات')}
                  </Button>
                </Stack>
              </Paper>

              <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid rgba(239,68,68,0.35)' }}>
                <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
                  <LockKeyhole color="#ef4444" />
                  <Typography fontWeight={950} color="#ef4444">{copy('Emergency account lock', 'قفل الحساب في حالة الطوارئ')}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  {copy('Disables this Firebase Auth user, revokes every token, suspends the protected profile and creates an immutable audit event.', 'يعطّل مستخدم Firebase Auth ويلغي جميع الرموز ويوقف الملف المحمي وينشئ حدث تدقيق دائمًا.')}
                </Typography>
                <Stack spacing={1.5}>
                  <TextField value={lockReason} onChange={(event) => setLockReason(event.target.value)} label={copy('Emergency reason', 'سبب الطوارئ')} multiline minRows={2} fullWidth />
                  <TextField value={lockConfirmation} onChange={(event) => setLockConfirmation(event.target.value)} label="LOCK_MY_ADMIN_ACCOUNT" fullWidth />
                  <Button color="error" variant="contained" disabled={busy || lockConfirmation !== 'LOCK_MY_ADMIN_ACCOUNT' || lockReason.trim().length < 8} onClick={() => void emergencyLock()}>
                    {copy('Lock my Admin account', 'قفل حساب المسؤول الخاص بي')}
                  </Button>
                </Stack>
              </Paper>

              <Paper sx={{ p: 3, borderRadius: 4 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
                  <UserRound color={binThemeTokens.gold} />
                  <Typography fontWeight={950}>{copy('Security-event history', 'سجل أحداث الأمان')}</Typography>
                </Stack>
                <Stack spacing={1.25}>
                  {(profile?.securityEvents || []).map((event) => (
                    <Box key={event.id} sx={{ p: 1.5, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <Typography variant="body2" fontWeight={800}>{event.action}</Typography>
                      <Typography variant="caption" color="text.secondary">{formatDate(event.createdAtMs, locale)} · {event.targetType}/{event.targetId}</Typography>
                    </Box>
                  ))}
                  {!profile?.securityEvents?.length && <Typography color="text.secondary">{copy('No security events found.', 'لم يتم العثور على أحداث أمان.')}</Typography>}
                </Stack>
              </Paper>
            </Stack>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  );
}
