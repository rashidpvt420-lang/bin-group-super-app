import React from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { financeGrantCapabilities } from '../../security/staffAccessPolicy';
import {
  FINANCE_REGRANT_ACTION, actionLabel, approveBlockReason, formatDubaiTime, formatDuration, regrantBlockReason,
  rejectBlockReason, roleLabel,
  type FinanceAccount, type GrantViewer, type PendingGrant,
} from './financeGrantView';

// Finance grants: request, independently approve or reject Finance approver authority, and re-grant
// (refresh the 24-hour financeAuthorizedAt) for an existing Finance account. Every button is a thin
// wrapper over the existing two-person callables; the server re-checks role, MFA, requester/target
// segregation and the 24-hour expiry on every call. This screen never approves anything by itself.
type Overview = { nowMs: number; viewer: GrantViewer; pending: PendingGrant[]; financeAccounts: FinanceAccount[] };

const errorText = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.replace(/^FirebaseError:\s*/i, '') || 'Request failed.';
};

export default function FinanceGrantsPage() {
  const { isRTL } = useLanguage();
  const t = React.useCallback((en: string, ar: string) => (isRTL ? ar : en), [isRTL]);
  const { user, mfaVerified } = useAuth();
  const localCaps = financeGrantCapabilities(user, mfaVerified);
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [approveTarget, setApproveTarget] = React.useState<PendingGrant | null>(null);
  const [approveConfirmed, setApproveConfirmed] = React.useState(false);
  const [rejectTarget, setRejectTarget] = React.useState<PendingGrant | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');
  const [assignUid, setAssignUid] = React.useState('');
  const [assignRole, setAssignRole] = React.useState('finance_manager');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result: any = await httpsCallable(functions, 'adminListFinanceGrantOverview')({});
      setOverview(result.data as Overview);
    } catch (loadError) {
      setOverview(null);
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (localCaps.canView && localCaps.mfaReady) void load();
    else setLoading(false);
  }, [load, localCaps.canView, localCaps.mfaReady]);

  const viewer = overview?.viewer || null;
  const nowMs = Date.now();

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(label);
      await load();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusy(false);
    }
  };

  const requestRegrant = (account: FinanceAccount) => run(
    t('Re-grant requested. A different Super Admin, CEO or Finance Controller must approve it within 24 hours.', 'تم طلب التجديد. يجب أن يوافق عليه مشرف عام أو رئيس تنفيذي أو مراقب مالي آخر خلال 24 ساعة.'),
    () => httpsCallable(functions, 'adminRequestFinanceRoleAssignment')({
      targetUid: account.uid,
      targetRole: account.role,
      actionType: FINANCE_REGRANT_ACTION,
    }),
  );

  const requestAssignment = () => run(
    t('Finance role requested. A different Super Admin, CEO or Finance Controller must approve it within 24 hours.', 'تم طلب الدور المالي. يجب أن يوافق عليه مشرف عام أو رئيس تنفيذي أو مراقب مالي آخر خلال 24 ساعة.'),
    () => httpsCallable(functions, 'adminRequestFinanceRoleAssignment')({
      targetUid: assignUid.trim(),
      targetRole: assignRole,
      actionType: 'PROMOTE_STAFF',
    }),
  );

  const confirmApprove = async () => {
    const grant = approveTarget;
    if (!grant || !approveConfirmed) return;
    setApproveTarget(null);
    setApproveConfirmed(false);
    await run(
      t('Approved. The account must sign in again with MFA before the new authorization is used.', 'تمت الموافقة. يجب أن يسجّل الحساب الدخول مجدداً بالتحقق الثنائي قبل استخدام التفويض الجديد.'),
      () => httpsCallable(functions, 'adminApproveFinanceRoleAssignment')({ authorizationId: grant.authorizationId }),
    );
  };

  const confirmReject = async () => {
    const grant = rejectTarget;
    const reason = rejectReason.trim();
    if (!grant || reason.length < 8) return;
    setRejectTarget(null);
    setRejectReason('');
    await run(
      t('Request rejected.', 'تم رفض الطلب.'),
      () => httpsCallable(functions, 'adminRejectFinanceRoleAssignment')({ authorizationId: grant.authorizationId, reason }),
    );
  };

  if (!localCaps.canView) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }} dir={isRTL ? 'rtl' : 'ltr'}>
        <Alert severity="warning" data-testid="finance-grants-not-authorized">
          {t('Finance grants are visible only to a Super Admin, CEO or Finance Controller.', 'صلاحيات المالية مرئية فقط للمشرف العام أو الرئيس التنفيذي أو المراقب المالي.')}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }} dir={isRTL ? 'rtl' : 'ltr'}>
      <Stack spacing={3}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="h4" fontWeight={950} color="white">{t('Finance Grants', 'صلاحيات المالية')}</Typography>
          <Typography color="text.secondary">
            {t(
              'Two-person control: a Super Admin or CEO requests; a different Super Admin, CEO or Finance Controller approves within 24 hours. Both need MFA. Each approved grant authorizes money actions for 24 hours.',
              'تحكم ثنائي: يطلب المشرف العام أو الرئيس التنفيذي، ويوافق مشرف عام أو رئيس تنفيذي أو مراقب مالي آخر خلال 24 ساعة. يتطلب الطرفان التحقق الثنائي. كل صلاحية معتمدة تخوّل الإجراءات المالية لمدة 24 ساعة.',
            )}
          </Typography>
        </Box>

        {!localCaps.mfaReady && (
          <Alert severity="warning" data-testid="finance-grants-mfa-required">
            {t('Sign in again and complete MFA. Finance grants are hidden until this session is MFA-verified.', 'سجّل الدخول مجدداً وأكمل التحقق الثنائي. تبقى صلاحيات المالية مخفية حتى يتم التحقق من الجلسة.')}
          </Alert>
        )}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}

        {viewer && (
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap" useFlexGap data-testid="finance-grants-viewer">
            <Chip label={`${t('You', 'أنت')}: ${roleLabel(viewer.role, t)}`} />
            <Chip color={viewer.canRequest ? 'success' : 'default'} label={viewer.canRequest ? t('Can request', 'يمكنك الطلب') : t('Cannot request', 'لا يمكنك الطلب')} />
            <Chip color={viewer.canApprove ? 'success' : 'default'} label={viewer.canApprove ? t('Can approve others’ requests', 'يمكنك اعتماد طلبات الآخرين') : t('Cannot approve', 'لا يمكنك الاعتماد')} />
          </Stack>
        )}

        {loading ? <CircularProgress /> : overview && (
          <>
            <Paper sx={{ p: 2.5, borderRadius: 3 }} data-testid="finance-grants-pending">
              <Typography variant="h6" fontWeight={900} gutterBottom>{t('Pending requests', 'الطلبات المعلقة')}</Typography>
              {overview.pending.length === 0 ? (
                <Typography color="text.secondary">{t('No requests are waiting for approval.', 'لا توجد طلبات بانتظار الموافقة.')}</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('Action', 'الإجراء')}</TableCell>
                      <TableCell>{t('Target', 'المستهدف')}</TableCell>
                      <TableCell>{t('Requested by', 'مقدم الطلب')}</TableCell>
                      <TableCell>{t('Created', 'تاريخ الإنشاء')}</TableCell>
                      <TableCell>{t('Expires', 'تنتهي')}</TableCell>
                      <TableCell>{t('Decision', 'القرار')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {overview.pending.map((grant) => {
                      const approveReason = approveBlockReason(grant, viewer, mfaVerified, nowMs, t);
                      const rejectReasonText = rejectBlockReason(grant, viewer, mfaVerified, nowMs, t);
                      return (
                        <TableRow key={grant.authorizationId} data-testid={`finance-grant-${grant.authorizationId}`}>
                          <TableCell>{actionLabel(grant.actionType, t)}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {grant.targetDisplayName || grant.targetEmail || grant.targetUid}
                              </Typography>
                              {grant.targetStaffNumber && (
                                <Chip label={`#${grant.targetStaffNumber}`} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800 }} />
                              )}
                            </Stack>
                            <Typography variant="caption" color="text.secondary">{grant.targetEmail} · {roleLabel(grant.targetRole, t)}</Typography>
                          </TableCell>
                          <TableCell>{grant.requesterEmail || grant.requesterId}<br /><Typography variant="caption" color="text.secondary">{roleLabel(grant.requesterRole, t)}</Typography></TableCell>
                          <TableCell>{formatDubaiTime(grant.createdAtMs, isRTL)}</TableCell>
                          <TableCell>
                            {formatDubaiTime(grant.expiresAtMs, isRTL)}<br />
                            <Typography variant="caption" color={grant.isExpired ? 'error' : 'text.secondary'}>
                              {grant.isExpired ? t('Expired', 'منتهي') : `${t('Remaining', 'المتبقي')}: ${formatDuration(grant.expiresAtMs === null ? null : grant.expiresAtMs - nowMs, t)}`}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1}>
                              <Tooltip title={approveReason}><span>
                                <Button size="small" variant="contained" color="success" data-testid="finance-grant-approve" disabled={busy || Boolean(approveReason)} onClick={() => { setApproveConfirmed(false); setApproveTarget(grant); }}>{t('Approve', 'موافقة')}</Button>
                              </span></Tooltip>
                              <Tooltip title={rejectReasonText}><span>
                                <Button size="small" variant="outlined" color="error" data-testid="finance-grant-reject" disabled={busy || Boolean(rejectReasonText)} onClick={() => { setRejectReason(''); setRejectTarget(grant); }}>{t('Reject', 'رفض')}</Button>
                              </span></Tooltip>
                            </Stack>
                            {approveReason && <Typography variant="caption" color="text.secondary" display="block" data-testid="finance-grant-approve-reason">{approveReason}</Typography>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Paper>

            <Paper sx={{ p: 2.5, borderRadius: 3 }} data-testid="finance-grants-accounts">
              <Typography variant="h6" fontWeight={900} gutterBottom>{t('Finance accounts and grant age', 'حسابات المالية وعمر الصلاحية')}</Typography>
              {overview.financeAccounts.length === 0 ? (
                <Typography color="text.secondary">{t('No Finance accounts found.', 'لا توجد حسابات مالية.')}</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('Account', 'الحساب')}</TableCell>
                      <TableCell>{t('Role', 'الدور')}</TableCell>
                      <TableCell>{t('TOTP', 'TOTP')}</TableCell>
                      <TableCell>{t('Granted', 'تاريخ المنح')}</TableCell>
                      <TableCell>{t('Grant expires', 'انتهاء الصلاحية')}</TableCell>
                      <TableCell>{t('Re-grant', 'التجديد')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {overview.financeAccounts.map((account) => {
                      const reason = regrantBlockReason(account, viewer, mfaVerified, t);
                      return (
                        <TableRow key={account.uid} data-testid={`finance-account-${account.uid}`}>
                          <TableCell>
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {account.displayName || account.email}
                              </Typography>
                              {account.staffNumber && (
                                <Chip label={`#${account.staffNumber}`} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 800 }} />
                              )}
                            </Stack>
                            <Typography variant="caption" color="text.secondary">{account.email}{account.active ? '' : ` · ${t('suspended/disabled', 'موقوف/معطّل')}`}</Typography>
                          </TableCell>
                          <TableCell>{roleLabel(account.role, t)}</TableCell>
                          <TableCell><Chip size="small" color={account.totpEnrolled ? 'success' : 'warning'} label={account.totpEnrolled ? t('Enrolled', 'مسجّل') : t('Missing', 'غير مسجّل')} /></TableCell>
                          <TableCell>
                            {formatDubaiTime(account.grantedAtMs, isRTL)}<br />
                            <Typography variant="caption" color="text.secondary">{t('Age', 'العمر')}: {formatDuration(account.grantAgeMs, t)}</Typography>
                          </TableCell>
                          <TableCell>
                            {formatDubaiTime(account.grantExpiresAtMs, isRTL)}<br />
                            <Chip size="small" color={account.grantFresh ? 'success' : 'error'} label={account.grantFresh ? t('Valid', 'سارية') : t('Expired or missing — money actions blocked', 'منتهية أو مفقودة — الإجراءات المالية محظورة')} />
                          </TableCell>
                          <TableCell>
                            <Tooltip title={reason}><span>
                              <Button size="small" variant="outlined" data-testid="finance-account-request-regrant" disabled={busy || Boolean(reason)} onClick={() => void requestRegrant(account)}>{t('Request re-grant', 'طلب تجديد')}</Button>
                            </span></Tooltip>
                            {reason && <Typography variant="caption" color="text.secondary" display="block">{reason}</Typography>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Paper>

            <Paper sx={{ p: 2.5, borderRadius: 3 }} data-testid="finance-grants-assign">
              <Typography variant="h6" fontWeight={900} gutterBottom>{t('Request a Finance role for existing staff', 'طلب دور مالي لموظف حالي')}</Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t(
                  'New staff created in HR > Staff Access with a Finance role already get a pending request listed above. Use this only to promote an existing staff account. Enter the staff UID.',
                  'الموظفون الجدد المنشأون من الموارد البشرية > صلاحيات الموظفين بدور مالي يحصلون تلقائياً على طلب معلق يظهر أعلاه. استخدم هذا فقط لترقية حساب موظف حالي. أدخل معرّف الموظف.',
                )}
              </Typography>
              <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={1.5}>
                <TextField size="small" label={t('Staff number or UID', 'الرقم الوظيفي أو معرّف الموظف')} value={assignUid} onChange={(event) => setAssignUid(event.target.value)} inputProps={{ 'data-testid': 'finance-assign-uid' }} />
                <TextField size="small" select label={t('Finance role', 'الدور المالي')} value={assignRole} onChange={(event) => setAssignRole(event.target.value)} sx={{ minWidth: 220 }}>
                  {['finance_manager', 'finance_controller', 'finance_admin'].map((role) => <MenuItem key={role} value={role}>{roleLabel(role, t)}</MenuItem>)}
                </TextField>
                <Tooltip title={viewer?.canRequest && mfaVerified ? '' : t('Only a Super Admin or CEO with MFA can request.', 'الطلب متاح فقط للمشرف العام أو الرئيس التنفيذي مع التحقق الثنائي.')}><span>
                  <Button variant="contained" data-testid="finance-assign-request" disabled={busy || !viewer?.canRequest || !mfaVerified || assignUid.trim().length < 5 || assignUid.trim() === viewer?.uid} onClick={() => void requestAssignment()}>{t('Request role', 'طلب الدور')}</Button>
                </span></Tooltip>
              </Stack>
              {assignRole === 'finance_admin' && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  {t('Production allows exactly one Finance Admin. A second Finance Admin is flagged as an unexpected privileged account.', 'يسمح الإنتاج بمسؤول مالية واحد فقط. أي مسؤول مالية ثانٍ يُعلَّم كحساب مميز غير متوقع.')}
                </Alert>
              )}
            </Paper>
          </>
        )}
      </Stack>

      <Dialog open={Boolean(approveTarget)} onClose={() => setApproveTarget(null)} dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogTitle>{t('Approve Finance grant', 'الموافقة على صلاحية مالية')}</DialogTitle>
        <DialogContent>
          {approveTarget && (
            <Stack spacing={1.5}>
              <Typography>{actionLabel(approveTarget.actionType, t)} · {roleLabel(approveTarget.targetRole, t)}</Typography>
              <Typography variant="body2">{t('Target', 'المستهدف')}: {approveTarget.targetEmail}</Typography>
              <Typography variant="body2">{t('Requested by', 'مقدم الطلب')}: {approveTarget.requesterEmail}</Typography>
              <FormControlLabel
                control={<Checkbox checked={approveConfirmed} onChange={(event) => setApproveConfirmed(event.target.checked)} inputProps={{ 'aria-label': 'independent review confirmation' }} data-testid="finance-grant-approve-confirm" />}
                label={t('I reviewed this request myself and I am not the requester or the target.', 'راجعت هذا الطلب بنفسي ولست مقدم الطلب ولا الشخص المستهدف.')}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveTarget(null)}>{t('Cancel', 'إلغاء')}</Button>
          <Button variant="contained" color="success" disabled={!approveConfirmed || busy} data-testid="finance-grant-approve-submit" onClick={() => void confirmApprove()}>{t('Approve', 'موافقة')}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogTitle>{t('Reject Finance grant', 'رفض صلاحية مالية')}</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline minRows={2} sx={{ mt: 1 }} label={t('Reason (at least 8 characters)', 'السبب (8 أحرف على الأقل)')} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} inputProps={{ 'data-testid': 'finance-grant-reject-reason' }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)}>{t('Cancel', 'إلغاء')}</Button>
          <Button variant="contained" color="error" disabled={rejectReason.trim().length < 8 || busy} data-testid="finance-grant-reject-submit" onClick={() => void confirmReject()}>{t('Reject', 'رفض')}</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
