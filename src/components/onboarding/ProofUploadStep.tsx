import React, { useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Paper, Stack, Typography, alpha
} from '@mui/material';
import { AlertCircle, CheckCircle, FileText, Trash2, Upload } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { removeStagedFile, stageFile } from '../../lib/onboardingDb';

interface ProofUploadStepProps { onNext: () => void; onBack: () => void }
type ProofKey = 'propertyProof' | 'emiratesId' | 'passport' | 'tradeLicense' | 'tenancySupport';
type LocalText = { en: string; ar: string };
const tx = (text: LocalText, ar: boolean) => ar ? text.ar : text.en;

const copy = {
    title: { en: 'Protected Documents', ar: 'المستندات المحمية' },
    desc: { en: 'Upload property proof and the correct legal-identity evidence for the contracting Owner.', ar: 'ارفع إثبات العقار ومستندات الهوية القانونية الصحيحة للمالك المتعاقد.' },
    secure: { en: 'Documents are staged only in this browser session, then uploaded to protected storage during final submission.', ar: 'تُجهز المستندات داخل جلسة المتصفح فقط، ثم تُرفع إلى التخزين المحمي أثناء الإرسال النهائي.' },
    identityRule: { en: 'Identity rule: Emirates ID + passport for an individual Owner, or a trade licence for a company/government entity.', ar: 'قاعدة الهوية: الهوية الإماراتية مع جواز السفر للمالك الفرد، أو الرخصة التجارية للشركة/الجهة الحكومية.' },
    drop: { en: 'Drop file here or click to browse', ar: 'اسحب الملف هنا أو اضغط للاختيار' },
    max: { en: 'PDF, JPG or PNG · max 15 MB', ar: 'PDF أو JPG أو PNG · بحد أقصى 15 ميجابايت' },
    ready: { en: 'Ready for protected submission', ar: 'جاهز للإرسال المحمي' },
    remove: { en: 'Remove', ar: 'إزالة' },
    summary: { en: 'Document readiness', ar: 'جاهزية المستندات' },
    uploaded: { en: 'documents selected', ar: 'مستندات محددة' },
    propertyRequired: { en: 'Property proof is required.', ar: 'إثبات العقار مطلوب.' },
    identityRequired: { en: 'Add Emirates ID plus passport, or add a trade licence.', ar: 'أضف الهوية الإماراتية مع جواز السفر، أو أضف الرخصة التجارية.' },
    back: { en: 'Back', ar: 'رجوع' },
    continue: { en: 'Continue to Review', ar: 'المتابعة إلى المراجعة' },
    removeTitle: { en: 'Remove document?', ar: 'إزالة المستند؟' },
    removeBody: { en: 'Remove this staged document? It must be selected again before final submission.', ar: 'هل تريد إزالة هذا المستند المجهز؟ يجب اختياره مرة أخرى قبل الإرسال النهائي.' },
    cancel: { en: 'Cancel', ar: 'إلغاء' },
    fileTooLarge: { en: 'File is larger than 15 MB.', ar: 'حجم الملف أكبر من 15 ميجابايت.' },
    invalidType: { en: 'Only PDF, JPG and PNG files are accepted.', ar: 'يتم قبول ملفات PDF وJPG وPNG فقط.' },
    stageFailed: { en: 'Failed to stage file', ar: 'فشل تجهيز الملف' },
    removeFailed: { en: 'Failed to remove file', ar: 'فشل إزالة الملف' },
};

const documentTypes: Array<{ key: ProofKey; label: LocalText; requirement: LocalText; accept: string }> = [
    { key: 'propertyProof', label: { en: 'Property Proof', ar: 'إثبات العقار' }, requirement: { en: 'Title deed or authorised tenancy/management contract', ar: 'سند ملكية أو عقد إيجار/إدارة معتمد' }, accept: '.pdf,.jpg,.jpeg,.png' },
    { key: 'emiratesId', label: { en: "Owner's Emirates ID", ar: 'الهوية الإماراتية للمالك' }, requirement: { en: 'Individual Owner identity part 1', ar: 'الجزء الأول من هوية المالك الفرد' }, accept: '.pdf,.jpg,.jpeg,.png' },
    { key: 'passport', label: { en: "Owner's Passport", ar: 'جواز سفر المالك' }, requirement: { en: 'Individual Owner identity part 2', ar: 'الجزء الثاني من هوية المالك الفرد' }, accept: '.pdf,.jpg,.jpeg,.png' },
    { key: 'tradeLicense', label: { en: 'Trade Licence', ar: 'الرخصة التجارية' }, requirement: { en: 'Company or government contracting identity', ar: 'هوية الشركة أو الجهة الحكومية المتعاقدة' }, accept: '.pdf,.jpg,.jpeg,.png' },
    { key: 'tenancySupport', label: { en: 'Additional Tenancy Support', ar: 'مستندات إيجارية داعمة' }, requirement: { en: 'Optional supporting evidence', ar: 'إثبات داعم اختياري' }, accept: '.pdf,.jpg,.jpeg,.png' },
];

export default function ProofUploadStep({ onNext, onBack }: ProofUploadStepProps) {
    const { setProofDocument, proofDocuments } = useOnboardingStore();
    const { isRTL, lang } = useLanguage();
    const ar = lang === 'ar';
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragOverKey, setDragOverKey] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<ProofKey | null>(null);

    const handleFileSelect = async (key: ProofKey, file: File | null) => {
        setError(null);
        if (!file) return;
        if (file.size > 15 * 1024 * 1024) { setError(tx(copy.fileTooLarge, ar)); return; }
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(file.type) && !/\.(pdf|jpg|jpeg|png)$/i.test(file.name)) { setError(tx(copy.invalidType, ar)); return; }
        try {
            setUploading(true);
            await stageFile(key, file);
            setProofDocument(key, { name: file.name, size: file.size, type: file.type });
        } catch (stageError: any) {
            setError(`${tx(copy.stageFailed, ar)}: ${stageError?.message || stageError}`);
        } finally { setUploading(false); }
    };

    const handleRemoveFile = async (key: ProofKey) => {
        try {
            await removeStagedFile(key);
            setProofDocument(key, null);
            setConfirmDelete(null);
        } catch (removeError: any) {
            setError(`${tx(copy.removeFailed, ar)}: ${removeError?.message || removeError}`);
        }
    };

    const hasPropertyProof = Boolean(proofDocuments.propertyProof);
    const hasIndividualIdentity = Boolean(proofDocuments.emiratesId && proofDocuments.passport);
    const hasEntityIdentity = Boolean(proofDocuments.tradeLicense);
    const canProceed = hasPropertyProof && (hasIndividualIdentity || hasEntityIdentity);
    const uploadedCount = documentTypes.filter((item) => proofDocuments[item.key]).length;

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 840, mx: 'auto', width: '100%', py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 } }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" color="#FFF" gutterBottom>{tx(copy.title, ar)}</Typography>
                <Typography color="rgba(255,255,255,0.58)">{tx(copy.desc, ar)}</Typography>
            </Box>
            <Paper sx={{ p: { xs: 2.5, md: 5 }, borderRadius: 6, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
                <Alert icon={<AlertCircle size={22} />} sx={{ mb: 2, bgcolor: alpha(binThemeTokens.gold, 0.06), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.24)}` }}>{tx(copy.secure, ar)}</Alert>
                <Alert severity="info" sx={{ mb: 3 }}>{tx(copy.identityRule, ar)}</Alert>

                <Stack spacing={2.5}>
                    {documentTypes.map(({ key, label, requirement, accept }) => {
                        const meta = proofDocuments[key];
                        const hasFile = Boolean(meta);
                        const required = key === 'propertyProof' || key === 'emiratesId' || key === 'passport' || key === 'tradeLicense';
                        return (
                            <Box key={key}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" mb={1}>
                                    <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                        <Typography color="#FFF" fontWeight={900}>{required && <span style={{ color: '#ef4444' }}>* </span>}{tx(label, ar)}</Typography>
                                        <Typography variant="caption" color="rgba(255,255,255,0.5)">{tx(requirement, ar)}</Typography>
                                    </Box>
                                    {hasFile && <CheckCircle size={18} color="#4ADE80" />}
                                </Stack>
                                {hasFile ? (
                                    <Box sx={{ p: 2, bgcolor: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.22)', borderRadius: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 2 }}>
                                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center"><FileText size={18} color="#4ADE80" /><Box sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography color="#FFF" fontWeight={800} sx={{ wordBreak: 'break-word' }}>{meta?.name}</Typography><Typography variant="caption" color="rgba(255,255,255,0.52)">{tx(copy.ready, ar)}</Typography></Box></Stack>
                                        <Button size="small" onClick={() => setConfirmDelete(key)} startIcon={<Trash2 size={14} />} color="error">{tx(copy.remove, ar)}</Button>
                                    </Box>
                                ) : (
                                    <Box
                                        onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
                                        onDragEnter={() => setDragOverKey(key)}
                                        onDragLeave={() => setDragOverKey(null)}
                                        onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setDragOverKey(null); void handleFileSelect(key, event.dataTransfer.files?.[0] || null); }}
                                        sx={{ p: 3, textAlign: 'center', border: '2px dashed', borderColor: dragOverKey === key ? binThemeTokens.gold : 'rgba(255,255,255,0.12)', borderRadius: 3, bgcolor: dragOverKey === key ? alpha(binThemeTokens.gold, 0.1) : 'rgba(0,0,0,0.25)' }}
                                    >
                                        <Button component="label" startIcon={<Upload size={18} />} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{tx(copy.drop, ar)}<input hidden type="file" accept={accept} onChange={(event) => void handleFileSelect(key, event.target.files?.[0] || null)} /></Button>
                                        <Typography variant="caption" display="block" color="rgba(255,255,255,0.5)" mt={1}>{tx(copy.max, ar)}</Typography>
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </Stack>

                <Box sx={{ mt: 4, p: 2.5, borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
                    <Typography color={binThemeTokens.gold} fontWeight={900}>{tx(copy.summary, ar)} · {uploadedCount}/{documentTypes.length}</Typography>
                    <Typography variant="body2" color={hasPropertyProof ? '#4ADE80' : '#FCA5A5'} mt={1}>{hasPropertyProof ? '✓' : '•'} {tx(copy.propertyRequired, ar)}</Typography>
                    <Typography variant="body2" color={hasIndividualIdentity || hasEntityIdentity ? '#4ADE80' : '#FCA5A5'}>{hasIndividualIdentity || hasEntityIdentity ? '✓' : '•'} {tx(copy.identityRequired, ar)}</Typography>
                </Box>

                <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ pt: 4 }}>
                    <Button variant="outlined" onClick={onBack} disabled={uploading} fullWidth sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', py: 1.5, borderRadius: 100, fontWeight: 950 }}>{tx(copy.back, ar)}</Button>
                    <Button variant="contained" onClick={onNext} disabled={!canProceed || uploading} fullWidth sx={{ bgcolor: canProceed ? binThemeTokens.gold : alpha(binThemeTokens.gold, 0.3), color: '#000', py: 1.5, borderRadius: 100, fontWeight: 950 }}>{uploading ? <CircularProgress size={24} color="inherit" /> : tx(copy.continue, ar)}</Button>
                </Stack>
            </Paper>

            <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} dir={isRTL ? 'rtl' : 'ltr'}>
                <DialogTitle sx={{ fontWeight: 950 }}>{tx(copy.removeTitle, ar)}</DialogTitle>
                <DialogContent><Typography>{tx(copy.removeBody, ar)}</Typography></DialogContent>
                <DialogActions><Button onClick={() => setConfirmDelete(null)}>{tx(copy.cancel, ar)}</Button><Button onClick={() => confirmDelete && void handleRemoveFile(confirmDelete)} variant="contained" color="error">{tx(copy.remove, ar)}</Button></DialogActions>
            </Dialog>
        </Box>
    );
}
