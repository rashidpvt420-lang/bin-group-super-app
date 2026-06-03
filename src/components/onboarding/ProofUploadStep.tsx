import React, { useState } from 'react';
import {
    Box, Typography, Button, Stack, Alert, Paper, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { Upload, FileText, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { stageFile, removeStagedFile } from '../../lib/onboardingDb';

interface ProofUploadStepProps {
    onNext: () => void;
    onBack: () => void;
}

type LocalText = { en: string; ar: string };
const tx = (text: LocalText, ar: boolean) => (ar ? text.ar : text.en);

const copy = {
    title: { en: 'Documents', ar: 'المستندات' },
    desc: { en: 'Upload proof of property ownership and identity verification documents. These will be securely stored.', ar: 'ارفع مستندات إثبات العقار والتحقق من الهوية. سيتم حفظها بشكل آمن.' },
    secure: { en: 'All documents are encrypted and securely stored. Only authorized admin staff can access them.', ar: 'جميع المستندات مشفرة ومحفوظة بأمان. يمكن للموظفين المصرح لهم فقط الوصول إليها.' },
    drop: { en: 'Drop file here or click to browse', ar: 'اسحب الملف هنا أو اضغط للاختيار' },
    max: { en: 'Max 15MB', ar: 'الحد الأقصى 15 ميجابايت' },
    ready: { en: 'Ready to upload', ar: 'جاهز للرفع' },
    remove: { en: 'Remove', ar: 'إزالة' },
    summary: { en: 'Upload Summary', ar: 'ملخص الرفع' },
    uploaded: { en: 'documents uploaded', ar: 'مستندات مرفوعة' },
    required: { en: 'Required documents', ar: 'المستندات المطلوبة' },
    back: { en: 'Back', ar: 'رجوع' },
    continue: { en: 'Continue to Account', ar: 'المتابعة إلى الحساب' },
    removeTitle: { en: 'Remove Document?', ar: 'إزالة المستند؟' },
    removeBody: { en: "Are you sure you want to remove this document? You'll need to upload it again to proceed.", ar: 'هل أنت متأكد من إزالة هذا المستند؟ ستحتاج إلى رفعه مرة أخرى للمتابعة.' },
    cancel: { en: 'Cancel', ar: 'إلغاء' },
    fileTooLarge: { en: 'File too large. Maximum size is 15MB.', ar: 'حجم الملف كبير جداً. الحد الأقصى هو 15 ميجابايت.' },
    invalidType: { en: 'Invalid file type. Only PDF, JPG, and PNG files are accepted.', ar: 'نوع الملف غير صالح. يتم قبول ملفات PDF وJPG وPNG فقط.' },
    stageFailed: { en: 'Failed to stage file', ar: 'فشل تجهيز الملف' },
    removeFailed: { en: 'Failed to remove file', ar: 'فشل إزالة الملف' },
};

export default function ProofUploadStep({ onNext, onBack }: ProofUploadStepProps) {
    const { setProofDocument, proofDocuments } = useOnboardingStore();
    const { isRTL, lang } = useLanguage();
    const ar = lang === 'ar';

    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragOverKey, setDragOverKey] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const documentTypes = [
        { key: 'propertyProof' as const, label: { en: 'Property Proof (Title Deed / Tenancy Contract)', ar: 'إثبات العقار (سند ملكية / عقد إيجار)' }, required: true, accept: '.pdf,.jpg,.jpeg,.png' },
        { key: 'emiratesId' as const, label: { en: "Owner's Emirates ID", ar: 'الهوية الإماراتية للمالك' }, required: true, accept: '.pdf,.jpg,.jpeg,.png' },
        { key: 'passport' as const, label: { en: "Owner's Passport", ar: 'جواز سفر المالك' }, required: true, accept: '.pdf,.jpg,.jpeg,.png' },
        { key: 'tradeLicense' as const, label: { en: 'Trade License (if applicable)', ar: 'الرخصة التجارية (إن وجدت)' }, required: false, accept: '.pdf,.jpg,.jpeg,.png' },
        { key: 'tenancySupport' as const, label: { en: 'Additional Tenancy Support Documents', ar: 'مستندات دعم إيجارية إضافية' }, required: false, accept: '.pdf,.jpg,.jpeg,.png' }
    ];

    const handleFileSelect = async (key: string, file: File | null) => {
        setError(null);
        if (!file) return;

        const maxSize = 15 * 1024 * 1024;
        if (file.size > maxSize) {
            setError(`${tx(copy.fileTooLarge, ar)} ${(file.size / 1024 / 1024).toFixed(2)}MB.`);
            return;
        }

        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png)$/i)) {
            setError(tx(copy.invalidType, ar));
            return;
        }

        try {
            setUploading(true);
            await stageFile(key, file);
            setProofDocument(key as any, { name: file.name, size: file.size, type: file.type });
            console.log(`[UPLOAD] File staged in IndexedDB: ${key} - ${file.name}`);
        } catch (err: any) {
            console.error('Staging file failed:', err);
            setError(`${tx(copy.stageFailed, ar)}: ${err.message}`);
        } finally {
            setUploading(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (key: string, e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverKey(null);
        if (e.dataTransfer.files.length > 0) handleFileSelect(key, e.dataTransfer.files[0]);
    };

    const handleRemoveFile = async (key: string) => {
        try {
            await removeStagedFile(key);
            setProofDocument(key as any, null);
            setConfirmDelete(null);
        } catch (err: any) {
            console.error('Failed to remove staged file:', err);
            setError(`${tx(copy.removeFailed, ar)}: ${err.message}`);
        }
    };

    const canProceed = documentTypes.filter(doc => doc.required).every(doc => proofDocuments[doc.key]);
    const uploadedCount = documentTypes.filter((doc) => proofDocuments[doc.key]).length;
    const requiredCount = documentTypes.filter(d => d.required).length;

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ maxWidth: 800, mx: 'auto', width: '100%', py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 }, overflow: 'visible' }}>
            <Box sx={{ textAlign: 'center', mb: { xs: 3, md: 4 } }}>
                <Typography variant="h4" fontWeight="950" color="#FFF" gutterBottom sx={{ fontSize: { xs: '1.8rem', md: '2.125rem' } }}>
                    {tx(copy.title, ar)}
                </Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">
                    {tx(copy.desc, ar)}
                </Typography>
            </Box>

            <Paper sx={{ p: { xs: 2, sm: 3, md: 5 }, borderRadius: { xs: 4, md: 6 }, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', overflow: 'visible' }}>
                {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

                <Alert icon={<AlertCircle size={22} color={binThemeTokens.gold} />} sx={{ mb: 3, bgcolor: 'rgba(212, 175, 55, 0.05)', color: binThemeTokens.gold, border: '1px solid rgba(212, 175, 55, 0.2)', '& .MuiAlert-icon': { alignItems: 'center', color: binThemeTokens.gold } }}>
                    {tx(copy.secure, ar)}
                </Alert>

                <Stack spacing={3}>
                    {documentTypes.map(({ key, label, required, accept }) => {
                        const hasFile = !!proofDocuments[key];
                        const fileName = proofDocuments.labels?.[key] || proofDocuments[key]?.name;

                        return (
                            <Box key={key}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Typography variant="subtitle2" sx={{ color: '#FFF', fontWeight: 700, textAlign: isRTL ? 'right' : 'left' }}>
                                        {required && <span style={{ color: '#ef4444' }}> *</span>}{tx(label, ar)}
                                    </Typography>
                                    {hasFile && <CheckCircle size={18} color="#4ADE80" />}
                                </Box>

                                {hasFile ? (
                                    <Box sx={{ p: 2, bgcolor: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.2)', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <FileText size={18} color="#4ADE80" />
                                            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{fileName}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>✅ {tx(copy.ready, ar)}</Typography>
                                            </Box>
                                        </Box>
                                        <Button size="small" onClick={() => setConfirmDelete(key)} startIcon={<Trash2 size={14} />} sx={{ color: '#ef4444', fontWeight: 700 }}>
                                            {tx(copy.remove, ar)}
                                        </Button>
                                    </Box>
                                ) : (
                                    <Box onDragOver={handleDragOver} onDragEnter={() => setDragOverKey(key)} onDragLeave={() => setDragOverKey(null)} onDrop={(e) => handleDrop(key, e)} sx={{ p: 3, textAlign: 'center', border: '2px dashed', borderColor: dragOverKey === key ? binThemeTokens.gold : 'rgba(255,255,255,0.1)', borderRadius: 2, bgcolor: dragOverKey === key ? 'rgba(212, 175, 55, 0.1)' : 'rgba(0,0,0,0.3)', cursor: 'pointer', transition: 'all 0.3s ease', '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(212, 175, 55, 0.05)' } }}>
                                        <label style={{ cursor: 'pointer', display: 'block', width: '100%' }}>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                                                <Upload size={24} color={binThemeTokens.gold} />
                                                <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 700 }}>{tx(copy.drop, ar)}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{tx(copy.max, ar)}</Typography>
                                            </Box>
                                            <input type="file" accept={accept} onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(key, e.target.files[0]); }} style={{ display: 'none' }} />
                                        </label>
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </Stack>

                <Box sx={{ mt: 4, p: 2, bgcolor: 'rgba(212, 175, 55, 0.05)', borderRadius: 2, border: '1px solid rgba(212, 175, 55, 0.2)' }}>
                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 700, display: 'block', mb: 1 }}>{tx(copy.summary, ar)}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block' }}>{uploadedCount} / {documentTypes.length} {tx(copy.uploaded, ar)}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 1 }}>{tx(copy.required, ar)}: {requiredCount}</Typography>
                </Box>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 4 }}>
                    <Button variant="outlined" onClick={onBack} disabled={uploading} fullWidth sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.2)', py: 1.5, px: 4, borderRadius: 100, fontWeight: 950 }}>{tx(copy.back, ar)}</Button>
                    <Button variant="contained" onClick={onNext} disabled={!canProceed || uploading} fullWidth sx={{ bgcolor: canProceed ? binThemeTokens.gold : 'rgba(212, 175, 55, 0.3)', color: '#000', fontWeight: 950, py: 1.5, px: 4, borderRadius: 100, '&:hover': { bgcolor: canProceed ? '#FFF' : undefined } }}>
                        {uploading ? <CircularProgress size={24} color="inherit" /> : <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{tx(copy.continue, ar)}</Box>}
                    </Button>
                </Stack>
            </Paper>

            <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} dir={isRTL ? 'rtl' : 'ltr'}>
                <DialogTitle sx={{ bgcolor: '#000', color: '#FFF', fontWeight: 950 }}>{tx(copy.removeTitle, ar)}</DialogTitle>
                <DialogContent sx={{ bgcolor: '#000', color: '#FFF', mt: 2 }}><Typography>{tx(copy.removeBody, ar)}</Typography></DialogContent>
                <DialogActions sx={{ bgcolor: '#000', p: 2 }}>
                    <Button onClick={() => setConfirmDelete(null)} sx={{ color: '#FFF' }}>{tx(copy.cancel, ar)}</Button>
                    <Button onClick={() => confirmDelete && handleRemoveFile(confirmDelete)} variant="contained" sx={{ bgcolor: '#ef4444', color: '#FFF', fontWeight: 950 }}>{tx(copy.remove, ar)}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
