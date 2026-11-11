import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  Grid,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { collection, db, functions, httpsCallable, onSnapshot } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { useAuth } from '../../context/AuthContext';
import { isFullAdminUser } from '../../security/staffAccessPolicy';

const EVENTS = [
  'TICKET_SUBMITTED',
  'TECH_ASSIGNED',
  'TECH_ARRIVED',
  'JOB_COMPLETED',
  'OWNER_APPROVAL_NEEDED',
  'RENT_DUE_REMINDER',
] as const;

const JOB_EVENTS = EVENTS.slice(0, 5);

type TemplateRecord = {
  event: string;
  templateName: string;
  approved: boolean;
  languageCodes: { ar: string; en: string };
};

const emptyForm = (event: string): TemplateRecord => ({
  event,
  templateName: '',
  approved: false,
  languageCodes: { ar: 'ar', en: 'en_US' },
});

export default function WhatsAppTemplatesPage() {
  const { isRTL } = useLanguage();
  const { user, mfaVerified } = useAuth();
  const t = (en: string, ar: string) => (isRTL ? ar : en);
  const allowed = isFullAdminUser(user) && mfaVerified;
  const [forms, setForms] = React.useState<Record<string, TemplateRecord>>(
    Object.fromEntries(EVENTS.map((event) => [event, emptyForm(event)])),
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [busyEvent, setBusyEvent] = React.useState<string | null>(null);

  React.useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'whatsapp_templates'),
      (snapshot) => {
        setForms((current) => {
          const next = { ...current };
          EVENTS.forEach((event) => {
            const doc = snapshot.docs.find((item) => item.id === event);
            const data = doc?.data() || {};
            next[event] = {
              event,
              templateName: String(data.templateName || next[event]?.templateName || ''),
              approved: data.approved === true,
              languageCodes: {
                ar: String(data.languageCodes?.ar || 'ar'),
                en: String(data.languageCodes?.en || 'en_US'),
              },
            };
          });
          return next;
        });
        setLoading(false);
        setError('');
      },
      (err) => {
        setLoading(false);
        setError(err?.message || t('Could not load templates.', 'تعذر تحميل القوالب.'));
      },
    );
    return () => unsub();
  }, [isRTL]);

  const jobReady = JOB_EVENTS.every((event) => forms[event]?.approved && forms[event]?.templateName);

  const save = async (event: string) => {
    if (!allowed) return;
    const form = forms[event];
    setBusyEvent(event);
    setNotice('');
    setError('');
    try {
      await httpsCallable(functions, 'adminUpsertWhatsAppTemplate')({
        event,
        templateName: form.templateName.trim().toLowerCase(),
        approved: form.approved === true,
        languageCodes: form.languageCodes,
      });
      setNotice(t('Template record saved. This does not send any WhatsApp message.', 'تم حفظ سجل القالب. هذا لا يرسل أي رسالة واتساب.'));
    } catch (err: any) {
      setError(err?.message || t('Could not save the template.', 'تعذر حفظ القالب.'));
    }
    setBusyEvent(null);
  };

  const update = (event: string, patch: Partial<TemplateRecord>) => {
    setForms((current) => ({ ...current, [event]: { ...current[event], ...patch } }));
  };

  if (!allowed) {
    return (
      <Box sx={{ p: { xs: 2, md: 4 }, direction: isRTL ? 'rtl' : 'ltr' }}>
        <Alert severity="warning">
          {t('Only Admin or CEO with a verified MFA session can register WhatsApp templates.', 'يمكن للمدير أو الرئيس التنفيذي فقط مع جلسة تحقق ثنائي موثّقة تسجيل قوالب واتساب.')}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, direction: isRTL ? 'rtl' : 'ltr' }} data-testid="whatsapp-templates-page">
      <Stack spacing={2}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {t('WhatsApp templates', 'قوالب واتساب')}
        </Typography>
        <Alert severity="info" data-testid="whatsapp-templates-honesty">
          {t(
            'WhatsApp job updates stay coming soon for owners and tenants until every job template below is marked approved after Meta approves it. Saving a name here does not send messages, and this screen never shows secret values.',
            'تبقى تحديثات واتساب «قريبًا» للملاك والمستأجرين حتى يتم تعليم كل قوالب الأعمال أدناه كمعتمدة بعد موافقة ميتا. حفظ الاسم هنا لا يرسل رسائل، ولا تعرض هذه الشاشة أي قيم سرية.',
          )}
        </Alert>
        <Chip
          label={jobReady
            ? t('Job templates marked approved in Admin (still requires Meta approval and a delivered test).', 'قوالب الأعمال معلَّمة كمعتمدة في الإدارة (ما زالت تحتاج موافقة ميتا واختبار تسليم).')
            : t('Job templates are not all approved yet — the user toggle stays “coming soon”.', 'لم تُعتمد كل قوالب الأعمال بعد — يبقى خيار المستخدم «قريبًا».')}
          sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', whiteSpace: 'normal', height: 'auto', py: 1 }}
        />
        {loading && <Typography>{t('Loading templates…', 'جارٍ تحميل القوالب…')}</Typography>}
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {!loading && (
          <Grid container spacing={2}>
            {EVENTS.map((event) => {
              const form = forms[event];
              return (
                <Grid item xs={12} md={6} key={event}>
                  <Card>
                    <CardContent>
                      <Stack spacing={1.5}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{event}</Typography>
                        <TextField
                          label={t('Meta template name', 'اسم قالب ميتا')}
                          value={form.templateName}
                          onChange={(e) => update(event, { templateName: e.target.value })}
                          size="small"
                          fullWidth
                          inputProps={{ autoComplete: 'off', 'data-testid': `whatsapp-template-name-${event}` }}
                        />
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                          <TextField
                            label={t('Arabic language code', 'رمز لغة العربية')}
                            value={form.languageCodes.ar}
                            onChange={(e) => update(event, { languageCodes: { ...form.languageCodes, ar: e.target.value } })}
                            size="small"
                          />
                          <TextField
                            label={t('English language code', 'رمز لغة الإنجليزية')}
                            value={form.languageCodes.en}
                            onChange={(e) => update(event, { languageCodes: { ...form.languageCodes, en: e.target.value } })}
                            size="small"
                          />
                        </Stack>
                        <FormControlLabel
                          control={<Switch checked={form.approved} onChange={(e) => update(event, { approved: e.target.checked })} />}
                          label={t('Marked approved after Meta approval', 'معلَّم كمعتمد بعد موافقة ميتا')}
                        />
                        <Button
                          variant="contained"
                          disabled={busyEvent === event || !form.templateName.trim()}
                          onClick={() => save(event)}
                        >
                          {t('Save template record', 'حفظ سجل القالب')}
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Stack>
    </Box>
  );
}
