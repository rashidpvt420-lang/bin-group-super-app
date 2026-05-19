import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Stack, Chip, CircularProgress,
    Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Button, alpha, Grid, Divider, Alert, TextField
} from '@mui/material';
import {
    FileText, Calendar, Shield, CheckCircle2,
    Download, Zap, Settings, Briefcase, Award, PenLine, MailCheck, ExternalLink
} from 'lucide-react';
import { db, collection, query, where, getDocs, onSnapshot, doc, updateDoc, serverTimestamp } from '../../lib/firebase';
import { addDoc } from 'firebase/firestore';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const STATUS_COLOR: Record<string, string> = {
    ACTIVE: '#10b981',
    SIGNED: '#10b981',
    PENDING_OWNER_SIGNATURE: '#f59e0b',
    EXPIRED: '#ef4444',
    PENDING: '#f59e0b',
    PENDING_APPROVAL: '#f59e0b',
    SUSPENDED: '#f97316'
};

const money = (value: any) => `AED ${Number(value || 0).toLocaleString()}`;

const contractPdfUrl = (contract: any) => {
    if (contract.finalPdfUrl) return contract.finalPdfUrl;
    if (contract.pdfUrl) return contract.pdfUrl;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://bin-groups.com';
    return `${origin}/owner/contracts?contract=${encodeURIComponent(contract.id || contract.contractId || '')}&signed=1`;
};

export default function OwnerContractsPage() {
    const { user } = useRole();
    const { t, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [contracts, setContracts] = useState<any[]>([]);
    const [updating, setUpdating] = useState(false);
    const [selectedService, setSelectedService] = useState<'PM_ONLY' | 'BOTH' | null>(null);
    const [signatureName, setSignatureName] = useState('');
    const [signingId, setSigningId] = useState<string | null>(null);

    useEffect(() => {
        if (!user?.email && !user?.uid) return;

        const email = String(user?.email || '').toLowerCase();
        const queries = [
            user?.uid ? query(collection(db, 'contracts'), where('ownerId', '==', user.uid)) : null,
            email ? query(collection(db, 'contracts'), where('ownerEmail', '==', email)) : null
        ].filter(Boolean) as any[];

        const seen = new Map<string, any>();
        const unsubscribes = queries.map((contractQ) => onSnapshot(contractQ, (snap) => {
            snap.docs.forEach((d) => seen.set(d.id, { id: d.id, ...d.data() }));
            const data = Array.from(seen.values()).sort((a, b) => String(b.updatedAt?.seconds || 0).localeCompare(String(a.updatedAt?.seconds || 0)));
            setContracts(data);
            if (data.length > 0) {
                const current = data[0].managementScope || data[0].contractType || data[0].planType;
                if (current === 'pm_only' || current === 'PM_ONLY') setSelectedService('PM_ONLY');
                else if (current === 'hybrid' || current === 'both' || current === 'BOTH') setSelectedService('BOTH');
            }
            setLoading(false);
        }, () => setLoading(false)));

        return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    }, [user?.email, user?.uid]);

    const handleServiceSelection = async (type: 'PM_ONLY' | 'BOTH') => {
        if (!contracts.length) return;
        setUpdating(true);
        try {
            const promises = contracts.map(c =>
                updateDoc(doc(db, 'contracts', c.id), {
                    managementScope: type,
                    contractType: type === 'PM_ONLY' ? 'pm_only' : 'hybrid',
                    updatedAt: serverTimestamp(),
                    version: (c.version || 1) + 1
                })
            );
            await Promise.all(promises);
            setSelectedService(type);
        } catch (err) {
            console.error('Governance Update Failed:', err);
        } finally {
            setUpdating(false);
        }
    };

    const handleSignContract = async (contract: any) => {
        const typedName = signatureName.trim() || user?.displayName || user?.email || '';
        if (!typedName) {
            alert('Enter your full name before signing the contract.');
            return;
        }
        if (!window.confirm('Sign this BIN GROUP contract electronically and receive the final PDF by email?')) return;

        setSigningId(contract.id);
        try {
            const pdfUrl = contractPdfUrl(contract);
            const ownerEmail = String(contract.ownerEmail || user?.email || '').toLowerCase();
            const ownerName = typedName;
            const signedAt = new Date().toISOString();

            await updateDoc(doc(db, 'contracts', contract.id), {
                status: 'ACTIVE',
                contractStatus: 'signed_active',
                activationStatus: 'ACTIVE',
                signed: true,
                ownerSigned: true,
                ownerSignedAt: serverTimestamp(),
                finalPdfUrl: pdfUrl,
                signatureState: {
                    ...(contract.signatureState || {}),
                    ownerSigned: true,
                    ownerSignedAt: signedAt,
                    ownerSignedBy: user?.uid || ownerEmail,
                    ownerSignerName: ownerName,
                    binGroupsApproved: true,
                    pdfGenerated: true,
                    emailed: true,
                    finalPdfUrl: pdfUrl
                },
                updatedAt: serverTimestamp()
            });

            await addDoc(collection(db, 'contract_signatures'), {
                contractId: contract.id,
                ownerId: contract.ownerId || user?.uid || '',
                ownerEmail,
                signerName: ownerName,
                signatureMethod: 'OWNER_PORTAL_ELECTRONIC_SIGNATURE',
                signedAt: serverTimestamp(),
                finalPdfUrl: pdfUrl,
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                createdAt: serverTimestamp()
            });

            await addDoc(collection(db, 'audit_logs'), {
                actorId: user?.uid || ownerEmail,
                actorRole: 'owner',
                action: 'OWNER_SIGN_CONTRACT',
                targetType: 'contracts',
                targetId: contract.id,
                metadata: { ownerEmail, signerName: ownerName, finalPdfUrl: pdfUrl },
                createdAt: serverTimestamp()
            });

            await addDoc(collection(db, 'notifications'), {
                userId: contract.ownerId || user?.uid || ownerEmail,
                toRole: 'owner',
                type: 'CONTRACT_SIGNED',
                title: 'Contract signed successfully',
                body: 'Your BIN GROUP service contract is active. The signed PDF has been queued for email delivery.',
                url: '/owner/contracts',
                read: false,
                createdAt: serverTimestamp()
            });

            if (ownerEmail) {
                await addDoc(collection(db, 'mail'), {
                    to: ownerEmail,
                    message: {
                        subject: 'BIN GROUP Signed Contract PDF',
                        html: `<p>Dear ${ownerName},</p><p>Your BIN GROUP service contract has been signed and activated.</p><p><a href="${pdfUrl}">Open signed contract PDF</a></p><p>Contract Ref: ${contract.id}</p>`
                    },
                    createdAt: serverTimestamp()
                });
            }

            alert('Contract signed. Final PDF email has been queued.');
            setSignatureName('');
        } catch (err) {
            console.error('Contract signature failed:', err);
            alert('Contract signature failed. Please try again or contact BIN GROUP admin.');
        } finally {
            setSigningId(null);
        }
    };

    if (loading) return (
        <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('gov.verifying_stream') || 'Verifying Governance Stream...'}</Typography>
        </Box>
    );

    return (
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 3 }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('gov.institutional_governance') || 'INSTITUTIONAL GOVERNANCE'}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>{t('nav.contracts') || 'Service Agreements'}</Typography>
                </Box>
                <Button variant="outlined" startIcon={<Download size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 900, borderRadius: 3, flexDirection: isRTL ? 'row-reverse' : 'row' }} onClick={() => contracts[0] && window.open(contractPdfUrl(contracts[0]), '_blank')}>
                    {t('gov.download_master') || 'Download Master Agreement'}
                </Button>
            </Box>

            {contracts.some((c) => c.status === 'PENDING_OWNER_SIGNATURE' || c.contractStatus === 'awaiting_owner_signature') && (
                <Paper sx={{ p: 4, mb: 5, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.28)}`, borderRadius: 5 }}>
                    <Stack spacing={2}>
                        <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', display: 'flex', gap: 1, alignItems: 'center' }}>
                            <PenLine color={binThemeTokens.gold} /> Contract Signature Required
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)' }}>
                            BIN GROUP admin has verified your payment, documents and property location. Type your full name and sign to activate your contract. The signed PDF will be emailed automatically.
                        </Typography>
                        <TextField
                            label="Full legal name for e-signature"
                            value={signatureName}
                            onChange={(e) => setSignatureName(e.target.value)}
                            InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }}
                            InputProps={{ style: { color: '#FFF' } }}
                        />
                    </Stack>
                </Paper>
            )}

            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                {t('gov.active_scope') || 'ACTIVE MANAGEMENT SCOPE'}
            </Typography>
            <Grid container spacing={3} sx={{ mb: 6, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Grid item xs={12} md={6}>
                    <Paper onClick={() => !updating && handleServiceSelection('PM_ONLY')} sx={{ p: 4, cursor: updating ? 'wait' : 'pointer', bgcolor: selectedService === 'PM_ONLY' ? alpha(binThemeTokens.gold, 0.05) : 'rgba(15, 23, 42, 0.4)', border: `2px solid ${selectedService === 'PM_ONLY' ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`, borderRadius: 8, transition: 'all 0.2s', textAlign: isRTL ? 'right' : 'left', position: 'relative', '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.03), borderColor: binThemeTokens.gold } }}>
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}><Briefcase size={24} /></Box>
                                {selectedService === 'PM_ONLY' && <CheckCircle2 size={24} color={binThemeTokens.gold} />}
                            </Box>
                            <Box><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{t('plan.pm_only.title') || 'PM ONLY'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{t('plan.pm_only.desc') || 'Property Management Execution'}</Typography></Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack spacing={1}>{['Tenant Relations', 'Rent Collection', 'Legal Compliance'].map(f => <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}><Zap size={12} color={binThemeTokens.gold} /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>{f}</Typography></Box>)}</Stack>
                        </Stack>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper onClick={() => !updating && handleServiceSelection('BOTH')} sx={{ p: 4, cursor: updating ? 'wait' : 'pointer', bgcolor: selectedService === 'BOTH' ? alpha(binThemeTokens.gold, 0.05) : 'rgba(15, 23, 42, 0.4)', border: `2px solid ${selectedService === 'BOTH' ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`, borderRadius: 8, transition: 'all 0.2s', textAlign: isRTL ? 'right' : 'left', '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.03), borderColor: binThemeTokens.gold } }}>
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}><Award size={24} /></Box>
                                {selectedService === 'BOTH' && <CheckCircle2 size={24} color={binThemeTokens.gold} />}
                            </Box>
                            <Box><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{t('plan.hybrid.title') || 'PM + FM (OPTIMIZED)'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{t('plan.hybrid.desc') || 'Full Sovereign Operations'}</Typography></Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Stack spacing={1}>{['PM Core Features', '24/7 Facility Maintenance', 'Preventive Scheduling'].map(f => <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}><Zap size={12} color={binThemeTokens.gold} /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>{f}</Typography></Box>)}</Stack>
                        </Stack>
                    </Paper>
                </Grid>
            </Grid>

            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                {t('gov.active_agreements') || 'ACTIVE SERVICE AGREEMENTS'}
            </Typography>
            {contracts.length === 0 ? (
                <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}>
                    <FileText size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>{t('gov.no_contracts') || 'NO MASTER CONTRACTS ON RECORD'}</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', textAlign: isRTL ? 'right' : 'left' }}>{t('gov.table.asset') || 'PROPERTY / ASSET'}</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', textAlign: isRTL ? 'right' : 'left' }}>{t('gov.table.service') || 'SERVICE LEVEL'}</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', textAlign: isRTL ? 'right' : 'left' }}>{t('gov.table.period') || 'VALIDITY PERIOD'}</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', textAlign: isRTL ? 'right' : 'left' }}>{t('gov.table.value') || 'ANNUAL VALUE'}</TableCell>
                                <TableCell align={isRTL ? 'left' : 'right'} sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>{t('gov.table.governance') || 'GOVERNANCE'}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {contracts.map(c => {
                                const needsSignature = c.status === 'PENDING_OWNER_SIGNATURE' || c.contractStatus === 'awaiting_owner_signature' || c.signatureState?.ownerSigned === false;
                                return (
                                    <TableRow key={c.id} hover>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 950 }}>{c.propertyName || t('gov.sovereign_asset') || 'Sovereign Asset'}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>{t('common.ref') || 'REF'}: #{String(c.id).slice(0,8)} (v{c.version || 1})</Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Chip label={c.packageName || c.contractType?.replace('_', ' ') || 'Institutional Package'} size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }} />
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center"><Calendar size={12} color="rgba(255,255,255,0.2)" /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>Active — Continuous</Typography></Stack>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{money(c.annualValue || c.annualContractValue)}</Typography></TableCell>
                                        <TableCell align={isRTL ? 'left' : 'right'}>
                                            <Stack direction="row" justifyContent="flex-end" spacing={1} flexWrap="wrap">
                                                <Chip label={needsSignature ? 'SIGNATURE REQUIRED' : (c.status || 'ACTIVE')} size="small" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha(STATUS_COLOR[c.status] || '#10b981', 0.1), color: STATUS_COLOR[c.status] || '#10b981' }} />
                                                {needsSignature ? (
                                                    <Button disabled={signingId === c.id} size="small" startIcon={<PenLine size={14} />} onClick={() => handleSignContract(c)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, '&:hover': { bgcolor: '#f5d782' } }}>
                                                        Sign Contract
                                                    </Button>
                                                ) : (
                                                    <Button size="small" startIcon={<ExternalLink size={14} />} onClick={() => window.open(contractPdfUrl(c), '_blank')} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>
                                                        PDF
                                                    </Button>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Paper sx={{ p: 3, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}>
                <Grid container spacing={4} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Grid item xs={12} md={9}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Shield size={16} /> {t('gov.sla_title') || 'SERVICE LEVEL ASSURANCE'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, display: 'block' }}>
                            Admin approval sends the contract signing link by email. Owner signature activates the agreement and queues the final signed PDF email.
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={3} sx={{ textAlign: isRTL ? 'left' : 'right' }}>
                        <Button variant="outlined" sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, px: 3, borderRadius: 3 }} startIcon={<MailCheck size={16} />}>
                            Email Enabled
                        </Button>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}
