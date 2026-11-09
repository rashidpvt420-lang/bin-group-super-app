import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { db, doc, functions, getDoc, httpsCallable } from '../../lib/firebase';
import { DEFAULT_SHIFT_END, DEFAULT_SHIFT_START } from '../../lib/staffScheduleDefaults';

// Nov 9 audit (P1-9): HR edits the weekly roster through the hrSetStaffRoster
// callable (server validates HH:MM, 1–14 h per day, at least one rest day, MFA).
type Day = { on: boolean; start: string; end: string };
const DAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'] as const;
const DAY_LABELS: Record<string, [string, string]> = {
    '0': ['Sunday', 'الأحد'], '1': ['Monday', 'الاثنين'], '2': ['Tuesday', 'الثلاثاء'], '3': ['Wednesday', 'الأربعاء'],
    '4': ['Thursday', 'الخميس'], '5': ['Friday', 'الجمعة'], '6': ['Saturday', 'السبت'],
};
// Default day: 8 AM - 5 PM with a 1 h unpaid break = 8 working hours (UAE Labour Law). Saturday and Sunday off.
const defaultWeek = (): Record<string, Day> => Object.fromEntries(DAY_KEYS.map((k) => [k, { on: !['0', '6'].includes(k), start: DEFAULT_SHIFT_START, end: DEFAULT_SHIFT_END }]));

export default function StaffRosterEditorDialog({ staff, onClose, onSaved }: { staff: { uid: string; displayName: string } | null; onClose: () => void; onSaved: (message: string) => void }) {
    const { lang } = useLanguage();
    const copy = (en: string, ar: string) => (lang === 'ar' ? ar : en);
    const [week, setWeek] = useState<Record<string, Day>>(defaultWeek);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSaved, setHasSaved] = useState(false);

    useEffect(() => {
        if (!staff) return;
        let cancelled = false;
        setWeek(defaultWeek()); setError(null); setHasSaved(false); setLoading(true);
        getDoc(doc(db, 'staff_roster', staff.uid))
            .then((snap) => {
                if (cancelled || !snap.exists()) return;
                const weekly = (snap.data() as any)?.weekly || {};
                setHasSaved(true);
                setWeek(Object.fromEntries(DAY_KEYS.map((k) => {
                    const d = weekly[k];
                    return [k, d && d.start && d.end ? { on: true, start: String(d.start), end: String(d.end) } : { on: false, start: DEFAULT_SHIFT_START, end: DEFAULT_SHIFT_END }];
                })));
            })
            .catch(() => undefined)
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [staff?.uid]);

    const save = async () => {
        if (!staff) return;
        setSaving(true); setError(null);
        try {
            const weekly = Object.fromEntries(DAY_KEYS.map((k) => [k, week[k].on ? { start: week[k].start, end: week[k].end } : null]));
            await httpsCallable(functions, 'hrSetStaffRoster')({ staffId: staff.uid, weekly });
            onSaved(copy(`Roster saved for ${staff.displayName}.`, `تم حفظ جدول الدوام لـ ${staff.displayName}.`));
            onClose();
        } catch (e: any) {
            setError(e?.message || copy('Roster could not be saved.', 'تعذر حفظ جدول الدوام.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={Boolean(staff)} onClose={onClose} maxWidth="sm" fullWidth data-testid="staff-roster-editor">
            <DialogTitle>{copy('Weekly roster', 'جدول الدوام الأسبوعي')} — {staff?.displayName}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>{copy('Times are Gulf Standard Time. Each working day must be 1–14 hours and at least one day a week must be a rest day. Staff get a reminder before each shift.', 'الأوقات بتوقيت الخليج. يجب أن يكون كل يوم عمل من 1 إلى 14 ساعة، ويجب أن يكون يوم واحد على الأقل في الأسبوع يوم راحة. يتلقى الموظف تذكيراً قبل كل وردية.')}</Typography>
                {!loading && !hasSaved && <Alert severity="info" sx={{ mb: 2 }}>{copy('No roster saved yet. Showing an 8-hour default; nothing is applied until you save.', 'لا يوجد جدول محفوظ بعد. يظهر جدول افتراضي من 8 ساعات ولن يُطبق شيء قبل الحفظ.')}</Alert>}
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {loading ? <CircularProgress size={22} /> : (
                    <Stack spacing={1.25}>
                        {DAY_KEYS.map((k) => (
                            <Stack key={k} direction="row" spacing={1.5} alignItems="center">
                                <FormControlLabel sx={{ minWidth: 150 }} control={<Checkbox checked={week[k].on} onChange={(e) => setWeek((w) => ({ ...w, [k]: { ...w[k], on: e.target.checked } }))} />} label={copy(DAY_LABELS[k][0], DAY_LABELS[k][1])} />
                                {week[k].on ? (
                                    <>
                                        <TextField size="small" type="time" label={copy('Start', 'البداية')} InputLabelProps={{ shrink: true }} value={week[k].start} onChange={(e) => setWeek((w) => ({ ...w, [k]: { ...w[k], start: e.target.value } }))} />
                                        <TextField size="small" type="time" label={copy('End', 'النهاية')} InputLabelProps={{ shrink: true }} value={week[k].end} onChange={(e) => setWeek((w) => ({ ...w, [k]: { ...w[k], end: e.target.value } }))} />
                                    </>
                                ) : <Typography variant="body2" sx={{ opacity: 0.6 }}>{copy('Rest day', 'يوم راحة')}</Typography>}
                            </Stack>
                        ))}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{copy('Cancel', 'إلغاء')}</Button>
                <Button variant="contained" disabled={saving || loading} onClick={() => void save()} data-testid="staff-roster-save">{saving ? <CircularProgress size={16} color="inherit" /> : copy('Save roster', 'حفظ الجدول')}</Button>
            </DialogActions>
        </Dialog>
    );
}
