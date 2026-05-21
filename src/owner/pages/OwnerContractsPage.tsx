import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Award, Briefcase, Calendar, CheckCircle2, Download, FileText, MailCheck, PenLine, Shield, Zap } from 'lucide-react';
import { collection, db, functions, httpsCallable, onSnapshot, query, type DocumentData, type QuerySnapshot, type Unsubscribe, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type ContractScope = 'FM_ONLY' | 'PM_ONLY' | 'BOTH';

type NoticeState = {
  type: 'success' | 'error' | 'info';
  text: string;
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#10b981',
  SIGNED: '#10b981',
  READY_FOR_ACTIVATION: '#10b981',
  APPROVED_PENDING_OWNER_SIGNATURE: '#f59e0b',
  PENDING_OWNER_SIGNATURE: '#f59e0b',
  PENDING: '#f59e0b',
  PENDING_APPROVAL: '#f59e0b',
  EXPIRED: '#ef4444',
  SUSPENDED: '#f97316',
};

const SIGNABLE_STATUSES = ['PENDING_OWNER_SIGNATURE', 'APPROVED_PENDING_OWNER_SIGNATURE', 'PENDING_SIGNATURE', 'DRAFT', 'PENDING'];
const POST_SIGNATURE_STATUSES = ['READY_FOR_ACTIVATION', 'ACTIVE', 'SIGNED'];

const firstPositiveNumber = (...values: any[]) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
};

const money = (value: any) => {
  const numeric = Number(value || 0);
  return numeric > 0 ? `AED ${numeric.toLocaleString()}` : 'Pending Admin Confirmation';
};

const annualValueOf = (contract: any) => firstPositiveNumber(
  contract?.annualValue,
  contract?.annualContractValue,
  contract?.estimatedAnnualValue,
  contract?.totalAnnual,
  contract?.quoteTotal,
  contract?.contractValue,
  contract?.serviceValue,
  contract?.pricing?.annualContractValue,
  contract?.pricing?.annualValue,
  contract?.quote?.annualContractValue,
  contract?.quote?.totalAnnual,
  contract?.payment?.annualValue,
  contract?.amount
);

const mobilizationOf = (contract: any) => {
  const annual = annualValueOf(contract);
  return firstPositiveNumber(
    contract?.mobilizationAmount,
    contract?.mobilizationFee,
    contract?.upfrontAmount,
    contract?.depositAmount,
    contract?.pricing?.mobilizationAmount,
    contract?.pricing?.upfrontAmount,
    contract?.quote?.mobilizationAmount,
    contract?.payment?.amount,
    contract?.paymentAmount,
    annual > 0 ? annual * 0.15 : 0
  );
};

const normalizeScope = (contract: any): ContractScope => {
  const raw = String(
    contract?.serviceType ||
      contract?.selectedContractType ||
      contract?.contractType ||
      contract?.managementScope ||
      contract?.planType ||
      contract?.selectedPlan?.type ||
      contract?.selectedPlan?.name ||
      contract?.serviceDetails?.selectedPlan ||
      contract?.packageName ||
      ''
  ).toLowerCase();

  if (raw.includes('pm_only') || raw.includes('property management only')) return 'PM_ONLY';
  if (raw.includes('hybrid') || raw.includes('both') || raw.includes('pm + fm') || raw.includes('property management +')) return 'BOTH';
  if (raw.includes('maintenance') || raw.includes('fm_only') || raw.includes('facility')) return 'FM_ONLY';
  return 'FM_ONLY';
};

const scopeCopy = (scope: ContractScope) => {
  if (scope === 'PM_ONLY') {
    return {
      title: 'Property Management Only',
      desc: 'Tenant relations, rent collection, reporting and legal coordination',
      features: ['Tenant Relations', 'Rent Collection', 'Legal Compliance'],
      icon: Briefcase,
    };
  }
  if (scope === 'BOTH') {
    return {
      title: 'Property Management + Facility Maintenance',
      desc: 'Full property operations with maintenance, preventive scheduling and service governance',
      features: ['PM Core Features', '24/7 Facility Maintenance', 'Preventive Scheduling'],
      icon: Award,
    };
  }
  return {
    title: 'Maintenance Contract Only',
    desc: 'Facility maintenance, emergency repairs, preventive scheduling and service governance',
    features: ['24/7 Facility Maintenance', 'Emergency Repairs', 'Preventive Scheduling'],
    icon: Shield,
  };
};

const isPostSignature = (contract: any) => {
  const status = String(contract?.status || '').toUpperCase();
  return POST_SIGNATURE_STATUSES.includes(status) || contract?.ownerSigned === true || contract?.signatureStatus === 'OWNER_SIGNED';
};

const isSignable = (contract: any) => {
  if (isPostSignature(contract)) return false;
  const status = String(contract?.status || '').toUpperCase();
  return SIGNABLE_STATUSES.includes(status) || contract?.contractStatus === 'awaiting_owner_signature';
};

const storedContractUrl = (contract: any) => contract?.finalPdfUrl || contract?.pdfUrl || contract?.downloadUrl || contract?.contractUrl || contract?.signedPdfUrl || '';

const escapeHtml = (value: any) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#039;');

const asArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
};

const firstText = (...values: any[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const dateText = (...values: any[]) => {
  for (const value of values) {
    if (!value) continue;
    const candidate = value?.toDate?.() || value;
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) return candidate.toLocaleString();
    const asDate = new Date(candidate);
    if (!Number.isNaN(asDate.getTime())) return asDate.toLocaleString();
    const text = String(candidate).trim();
    if (text) return text;
  }
  return 'N/A';
};

const tableRow = (label: string, value: any) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || 'N/A')}</td></tr>`;
const bulletList = (items: any[]) => items.filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join('');

const propertyRows = (contract: any) => {
  const propertyList = asArray(contract?.properties || contract?.propertyList || contract?.assets || contract?.serviceDetails?.propertiesList);
  if (propertyList.length > 0) {
    return propertyList.map((property, index) => {
      const name = firstText(property?.propertyName, property?.name, property?.title, property?.address, `Asset ${index + 1}`);
      const type = firstText(property?.type, property?.propertyType, property?.sector, contract?.sector, 'Property');
      const units = firstText(property?.units, property?.totalUnits, property?.unitCount, property?.apartments, 'N/A');
      const location = firstText(property?.location, property?.area, property?.emirate, property?.address, contract?.location, 'UAE');
      return `<tr><td>${escapeHtml(index + 1)}</td><td>${escapeHtml(name)}</td><td>${escapeHtml(type)}</td><td>${escapeHtml(units)}</td><td>${escapeHtml(location)}</td></tr>`;
    }).join('');
  }

  const assetCount = firstPositiveNumber(contract?.assets, contract?.assetCount, contract?.serviceDetails?.properties, contract?.portfolioSummary?.properties) || 1;
  const totalUnits = firstText(contract?.totalUnits, contract?.serviceDetails?.totalUnits, contract?.portfolioSummary?.totalUnits, 'N/A');
  return `<tr><td>1</td><td>${escapeHtml(firstText(contract?.propertyName, contract?.companyProfile?.name, 'Portfolio'))}</td><td>${escapeHtml(firstText(contract?.sector, contract?.propertyType, 'Institutional Portfolio'))}</td><td>${escapeHtml(totalUnits)}</td><td>${escapeHtml(firstText(contract?.location, contract?.emirate, 'UAE'))}</td></tr><tr><td colspan="5" class="muted">Declared asset count: ${escapeHtml(assetCount)}. Detailed asset schedule is subject to admin verification and property passport issuance.</td></tr>`;
};

const contractHtml = (contract: any) => {
  const scopeType = normalizeScope(contract);
  const scope = scopeCopy(scopeType);
  const annual = annualValueOf(contract);
  const mobilization = mobilizationOf(contract);
  const balance = annual > 0 && mobilization > 0 ? Math.max(annual - mobilization, 0) : 0;
  const createdAt = dateText(contract?.createdAt, contract?.submittedAt);
  const signedAt = dateText(contract?.signedAt, contract?.ownerSignedAt);
  const approvedAt = dateText(contract?.approvedAt, contract?.adminApprovedAt, contract?.verifiedAt);
  const validFrom = dateText(contract?.validFrom, contract?.startDate, contract?.activatedAt, contract?.createdAt);
  const validTo = dateText(contract?.validTo, contract?.endDate, contract?.expiryDate) === 'N/A' ? 'Continuous until expiry/termination under the agreed payment plan' : dateText(contract?.validTo, contract?.endDate, contract?.expiryDate);
  const ownerName = firstText(contract?.ownerName, contract?.companyProfile?.ownerName, contract?.companyProfile?.name, 'Owner / Client');
  const ownerEmail = firstText(contract?.ownerEmail, contract?.companyProfile?.email, 'N/A');
  const ownerUid = firstText(contract?.ownerUid, contract?.ownerId, contract?.createdBy, 'N/A');
  const packageName = firstText(contract?.packageName, contract?.selectedPlan?.name, contract?.serviceDetails?.selectedPlan, scope.title);
  const paymentPlan = firstText(contract?.paymentPlan, contract?.billingCycle, contract?.pricing?.paymentPlan, 'Annual / Quarterly / Monthly, subject to admin-approved invoice schedule');
  const selectedAddOns = asArray(contract?.selectedAddOns || contract?.serviceDetails?.selectedAddOns || contract?.addOns || contract?.addons).map((item) => typeof item === 'string' ? item : firstText(item?.name, item?.title, item?.label));
  const customInclusions = asArray(contract?.inclusions || contract?.scopeItems || contract?.serviceDetails?.inclusions).map((item) => typeof item === 'string' ? item : firstText(item?.name, item?.title, item?.label));
  const inclusions = customInclusions.length ? customInclusions : [
    'Preventive maintenance planning and service governance',
    'Corrective maintenance request handling through BIN GROUP portals',
    'Admin-supervised contractor/technician coordination',
    'Digital evidence trail with before/after photo controls where applicable',
    'Owner reporting and activation-gated dashboard controls',
    ...(scopeType !== 'FM_ONLY' ? ['Tenant-facing support coordination and property management workflow'] : []),
  ];
  const exclusions = asArray(contract?.exclusions || contract?.serviceDetails?.exclusions).map((item) => typeof item === 'string' ? item : firstText(item?.name, item?.title, item?.label));
  const finalExclusions = exclusions.length ? exclusions : [
    'Major capital works unless approved by separate quotation',
    'Government fees, authority fines, third-party statutory charges, and owner-specific permits',
    'Material replacement costs not expressly included in the approved package',
    'Emergency works outside agreed SLA/package unless separately approved',
  ];
  const slaRows = [
    ['Emergency / safety risk', 'Target response within 4 hours after valid ticket creation, subject to access and site conditions'],
    ['Urgent operational fault', 'Same day / next business day triage depending on severity and resources'],
    ['Standard maintenance request', 'Scheduled under preventive/corrective maintenance calendar'],
    ['Owner/admin escalation', 'Governed through BIN GROUP dashboard, audit logs, and admin verification workflow'],
  ].map(([priority, response]) => `<tr><td>${escapeHtml(priority)}</td><td>${escapeHtml(response)}</td></tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BIN GROUP Contract ${escapeHtml(contract?.id || '')}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 34px; color: #111827; line-height: 1.48; background: #ffffff; }
    button { float:right;padding:10px 16px;border-radius:8px;border:1px solid #c8a95b;background:#c8a95b;font-weight:800;cursor:pointer; }
    .header { border-bottom: 4px solid #c8a95b; padding-bottom: 18px; margin-bottom: 24px; }
    .brand { letter-spacing: 4px; color: #9f7e2f; font-weight: 900; font-size: 22px; }
    .title { font-size: 30px; font-weight: 900; margin: 12px 0 0; }
    .subtitle { color: #4b5563; margin-top: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 20px 0; }
    .card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; background: #f9fafb; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #6b7280; font-weight: 800; }
    .value { font-size: 16px; font-weight: 800; margin-top: 4px; }
    .section { margin-top: 24px; page-break-inside: avoid; }
    .section h2 { font-size: 18px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #e5e7eb; padding: 9px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #374151; }
    .warning { background: #fff7ed; border: 1px solid #f59e0b; border-radius: 12px; padding: 14px; margin-top: 14px; }
    .muted { color: #6b7280; font-size: 12px; }
    .clause { margin: 8px 0; }
    .sign { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
    .line { border-top: 1px solid #111827; padding-top: 10px; font-size: 12px; color: #374151; }
    .footer { margin-top: 34px; color: #6b7280; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    @media print { button { display: none; } body { margin: 22px; } .section { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <button onclick="window.print()">Print / Save as PDF</button>
  <div class="header">
    <div class="brand">BIN GROUP</div>
    <div class="title">Owner Service Agreement</div>
    <div class="subtitle">Property Management • Facility Maintenance • Digital Governance • UAE Portfolio Care</div>
  </div>

  <div class="section">
    <h2>1. Agreement Summary</h2>
    <div class="grid">
      <div class="card"><div class="label">Contract Reference</div><div class="value">${escapeHtml(contract?.id || contract?.contractId || 'N/A')}</div></div>
      <div class="card"><div class="label">Status</div><div class="value">${escapeHtml(contract?.status || 'N/A')}</div></div>
      <div class="card"><div class="label">Package</div><div class="value">${escapeHtml(packageName)}</div></div>
      <div class="card"><div class="label">Scope</div><div class="value">${escapeHtml(scope.title)}</div></div>
      <div class="card"><div class="label">Annual Value</div><div class="value">${escapeHtml(money(annual))}</div></div>
      <div class="card"><div class="label">15% Mobilization</div><div class="value">${escapeHtml(money(mobilization))}</div></div>
    </div>
    ${annual <= 0 || mobilization <= 0 ? '<div class="warning"><strong>Amount pending admin confirmation.</strong> This generated copy uses the current contract record. Admin must confirm the final contract amount, mobilization amount, and payment schedule before final dashboard unlock.</div>' : ''}
  </div>

  <div class="section">
    <h2>2. Parties</h2>
    <table><tbody>
      ${tableRow('Service Provider', 'BIN GROUP / BIN Construction & General Maintenance')}
      ${tableRow('Owner / Client', ownerName)}
      ${tableRow('Owner Email', ownerEmail)}
      ${tableRow('Owner UID / Reference', ownerUid)}
      ${tableRow('Registered Company / Portfolio', firstText(contract?.companyProfile?.name, contract?.propertyName, 'Portfolio'))}
      ${tableRow('Trade License / KYC Reference', firstText(contract?.companyProfile?.licenseNumber, contract?.licenseNumber, contract?.kycReference, 'Subject to admin verification'))}
    </tbody></table>
  </div>

  <div class="section">
    <h2>3. Property / Asset Schedule</h2>
    <table>
      <thead><tr><th>#</th><th>Asset / Property</th><th>Type</th><th>Units</th><th>Location</th></tr></thead>
      <tbody>${propertyRows(contract)}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>4. Financial Terms</h2>
    <table><tbody>
      ${tableRow('Annual Contract Value', money(annual))}
      ${tableRow('15% Mobilization / Activation Payment', money(mobilization))}
      ${tableRow('Remaining Contract Balance', balance > 0 ? money(balance) : 'Pending Admin Confirmation')}
      ${tableRow('Payment Plan', paymentPlan)}
      ${tableRow('Currency', firstText(contract?.currency, contract?.pricing?.currency, 'AED'))}
      ${tableRow('Payment Verification', 'Dashboard unlock requires admin payment verification. Owner signature alone does not unlock the dashboard.')}
      ${tableRow('VAT / Tax Treatment', firstText(contract?.vatTreatment, contract?.taxTreatment, 'Subject to UAE VAT and invoice rules where applicable.'))}
    </tbody></table>
  </div>

  <div class="section">
    <h2>5. Service Scope and Inclusions</h2>
    <p><strong>${escapeHtml(scope.title)}</strong> — ${escapeHtml(scope.desc)}</p>
    <ul>${bulletList([...scope.features, ...inclusions])}</ul>
    ${selectedAddOns.length ? `<p><strong>Selected Add-ons:</strong></p><ul>${bulletList(selectedAddOns)}</ul>` : ''}
  </div>

  <div class="section">
    <h2>6. Exclusions and Owner Responsibilities</h2>
    <ul>${bulletList(finalExclusions)}</ul>
    <p class="clause">The owner must provide lawful access to the property, accurate KYC/property information, authority approvals where needed, and timely payment settlement. Any capital expenditure, replacement materials, specialist third-party works, or government fees must be separately approved unless expressly included in the package.</p>
  </div>

  <div class="section">
    <h2>7. SLA and Operations Governance</h2>
    <table><thead><tr><th>Priority</th><th>Service Governance</th></tr></thead><tbody>${slaRows}</tbody></table>
    <p class="clause">SLA timing is subject to site access, availability of parts/materials, authority restrictions, emergency conditions, and accurate ticket classification. BIN GROUP may require admin approval for high-value or out-of-scope works.</p>
  </div>

  <div class="section">
    <h2>8. Digital Evidence, Property Passport, and AuditShield</h2>
    <p class="clause">BIN GROUP may maintain a digital property passport, service history, document vault, ticket records, before/after evidence, payment verification logs, and audit entries linked to this contract. These records support transparency, dispute resolution, and owner dashboard reporting.</p>
    <p class="clause">No client-side action can independently activate the owner dashboard, mark payment verified, or override admin verification. Activation requires signed contract state, verified payment state, and admin-controlled contract/profile records.</p>
  </div>

  <div class="section">
    <h2>9. Term, Renewal, Suspension, and Termination</h2>
    <table><tbody>
      ${tableRow('Effective From', validFrom)}
      ${tableRow('Valid Until', validTo)}
      ${tableRow('Renewal', firstText(contract?.renewalTerms, 'Renewal is subject to admin-approved pricing, payment status, and owner confirmation.'))}
      ${tableRow('Suspension', 'BIN GROUP may suspend dashboard/service access for non-payment, missing KYC, rejected verification, unlawful access issues, or material breach.')}
      ${tableRow('Termination', firstText(contract?.terminationTerms, 'Termination is subject to written/admin-recorded notice and settlement of outstanding balances or approved close-out obligations.'))}
    </tbody></table>
  </div>

  <div class="section">
    <h2>10. Legal and Compliance Terms</h2>
    <p class="clause">This agreement is generated from the BIN GROUP digital contract record and is subject to final admin verification, UAE applicable laws, authority requirements, and the approved package/payment record. If a signed PDF or final admin-issued contract exists, that final signed version prevails over this generated fallback copy.</p>
    <p class="clause">The owner accepts that electronic signature, audit logs, payment verification records, property passport entries, and admin approval records may be used as operational evidence for service activation and governance.</p>
  </div>

  <div class="section">
    <h2>11. Audit Trail and Signature Certificate</h2>
    <table><tbody>
      ${tableRow('Created', createdAt)}
      ${tableRow('Admin Approved / Verified', approvedAt)}
      ${tableRow('Owner Signed', signedAt)}
      ${tableRow('Signature Status', contract?.signatureStatus || (contract?.ownerSigned ? 'OWNER_SIGNED' : 'PENDING'))}
      ${tableRow('Payment Status', firstText(contract?.paymentStatus, contract?.paymentVerified ? 'VERIFIED' : 'PENDING_ADMIN_VERIFICATION'))}
      ${tableRow('Active Contract ID', firstText(contract?.activeContractId, contract?.id, 'N/A'))}
    </tbody></table>
  </div>

  <div class="sign">
    <div class="line">Owner Signature / Electronic Acceptance<br/>Name: ${escapeHtml(ownerName)}<br/>Date: ${escapeHtml(signedAt)}</div>
    <div class="line">BIN GROUP Admin Verification<br/>Authorized Representative<br/>Date: ${escapeHtml(approvedAt)}</div>
  </div>

  <div class="footer">
    Generated by BIN GROUP Owner Portal. Fallback contract copy generated when no final stored PDF URL is available. Contract reference: ${escapeHtml(contract?.id || contract?.contractId || 'N/A')}.
  </div>
</body>
</html>`;
};

const downloadGeneratedContract = (contract: any) => {
  const blob = new Blob([contractHtml(contract)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeRef = String(contract?.id || contract?.contractId || 'contract').replace(/[^a-z0-9_-]/gi, '_');
  a.href = url;
  a.download = `BIN-GROUP-contract-${safeRef}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const openOrDownloadContract = (contract: any) => {
  if (!contract) return;
  const url = storedContractUrl(contract);
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  downloadGeneratedContract(contract);
};

export default function OwnerContractsPage() {
  const { user, refreshRole } = useRole();
  const { t, isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<any[]>([]);
  const [signatureName, setSignatureName] = useState('');
  const [signingId, setSigningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  useEffect(() => {
    if (!user?.email && !user?.uid) {
      setContracts([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const seen = new Map<string, any>();
    const email = String(user?.email || '').toLowerCase();

    const apply = (snap: QuerySnapshot<DocumentData>) => {
      snap.docs.forEach((doc) => seen.set(doc.id, { id: doc.id, ...doc.data() }));
      setContracts(Array.from(seen.values()).sort((a, b) => Number(b.updatedAt?.seconds || 0) - Number(a.updatedAt?.seconds || 0)));
      setLoading(false);
    };

    const fail = (err: any) => {
      console.error('Owner contracts query failed:', err);
      setNotice({ type: 'error', text: err?.message || 'Unable to load contracts.' });
      setLoading(false);
    };

    const unsubs: Unsubscribe[] = [];
    if (user?.uid) {
      unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('ownerUid', '==', user.uid)), apply, fail));
      unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('ownerId', '==', user.uid)), apply, fail));
    }
    if (email) {
      unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('ownerEmail', '==', email)), apply, fail));
      unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('ownerEmail', '==', user?.email || email)), apply, fail));
    }
    setSignatureName(user?.displayName || user?.email || '');
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user?.displayName, user?.email, user?.uid]);

  const primaryContract = useMemo(() => contracts.find(isSignable) || contracts.find(isPostSignature) || contracts[0], [contracts]);
  const selectedScope = normalizeScope(primaryContract);
  const selectedScopeCopy = scopeCopy(selectedScope);
  const ScopeIcon = selectedScopeCopy.icon;
  const hasSignatureRequired = useMemo(() => contracts.some(isSignable), [contracts]);

  const handleSignContract = async (contract: any) => {
    if (isPostSignature(contract)) {
      setNotice({ type: 'info', text: 'This contract is already signed and ready for activation/payment verification.' });
      return;
    }

    const name = signatureName.trim() || user?.displayName || user?.email || '';
    if (!name) {
      setNotice({ type: 'error', text: 'Enter your full legal name before signing.' });
      return;
    }
    if (!contract?.id) {
      setNotice({ type: 'error', text: 'No contract ID found for signing.' });
      return;
    }
    if (!window.confirm('Sign this contract electronically?')) return;

    setSigningId(contract.id);
    setNotice(null);
    try {
      const signContract = httpsCallable(functions, 'ownerSignContract');
      const result = await signContract({ contractId: contract.id, signatureName: name, acceptedTerms: true });
      const data = result.data as { status?: string; idempotent?: boolean };
      setNotice({ type: 'success', text: data?.idempotent ? 'Contract is already signed and ready for activation/payment verification.' : `Contract signed successfully. Status: ${data?.status || 'READY_FOR_ACTIVATION'}.` });
      setSignatureName('');
      await refreshRole?.();
    } catch (err: any) {
      console.error('Contract signature failed:', err);
      setNotice({ type: 'error', text: err?.message || 'Contract signature failed. Please try again or contact BIN GROUP admin.' });
    } finally {
      setSigningId(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ height: '60vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress sx={{ color: binThemeTokens.gold }} />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 3 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('gov.institutional_governance') || 'INSTITUTIONAL GOVERNANCE'}</Typography>
          <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>{t('nav.contracts') || 'Contracts'}</Typography>
        </Box>
        <Button variant="outlined" startIcon={<Download size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 900, borderRadius: 3 }} onClick={() => openOrDownloadContract(contracts[0])}>
          Download Master
        </Button>
      </Box>

      {notice && <Alert severity={notice.type} sx={{ mb: 3 }}>{notice.text}</Alert>}

      {hasSignatureRequired && (
        <Paper sx={{ p: 4, mb: 5, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.28)}`, borderRadius: 5 }}>
          <Stack spacing={2}>
            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', display: 'flex', gap: 1, alignItems: 'center' }}><PenLine color={binThemeTokens.gold} /> Contract Signature Required</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)' }}>Type your full legal name and sign. The backend verifies ownership and records the signature. Dashboard unlock still requires payment verification.</Typography>
            <TextField label="Full legal name for e-signature" value={signatureName} onChange={(event) => setSignatureName(event.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#FFF' } }} />
          </Stack>
        </Paper>
      )}

      <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3 }}>
        {isPostSignature(primaryContract) ? 'LOCKED CONTRACT SCOPE' : 'SELECTED CONTRACT SCOPE'}
      </Typography>
      <Grid container spacing={3} sx={{ mb: 6 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `2px solid ${binThemeTokens.gold}`, borderRadius: 8 }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold }}><ScopeIcon size={24} /></Box>
                <CheckCircle2 color={binThemeTokens.gold} />
              </Box>
              <Box>
                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{selectedScopeCopy.title}</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{selectedScopeCopy.desc}</Typography>
              </Box>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
              {selectedScopeCopy.features.map((feature) => <Typography key={feature} variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}><Zap size={12} color={binThemeTokens.gold} /> {feature}</Typography>)}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3 }}>{t('gov.active_agreements') || 'ACTIVE SERVICE AGREEMENTS'}</Typography>
      {contracts.length === 0 ? (
        <Paper sx={{ p: 10, textAlign: 'center', bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}><FileText size={48} color="rgba(255,255,255,0.08)" /><Typography sx={{ color: 'rgba(255,255,255,0.25)', fontWeight: 800 }}>NO CONTRACTS ON RECORD</Typography></Paper>
      ) : (
        <TableContainer component={Paper} sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
          <Table>
            <TableHead><TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}><TableCell>PROPERTY / ASSET</TableCell><TableCell>SERVICE LEVEL</TableCell><TableCell>VALIDITY</TableCell><TableCell>ANNUAL VALUE</TableCell><TableCell align="right">GOVERNANCE</TableCell></TableRow></TableHead>
            <TableBody>
              {contracts.map((contract) => {
                const needsSignature = isSignable(contract);
                const contractScope = scopeCopy(normalizeScope(contract));
                const color = STATUS_COLOR[contract.status] || '#10b981';
                const annual = annualValueOf(contract);
                return (
                  <TableRow key={contract.id} hover>
                    <TableCell><Typography variant="body2" sx={{ color: '#FFF', fontWeight: 950 }}>{contract.propertyName || contract.companyProfile?.name || 'Portfolio Contract'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>Ref: #{String(contract.id).slice(0, 8)}</Typography></TableCell>
                    <TableCell><Chip label={contract.packageName || contract.selectedPlan?.name || contract.serviceDetails?.selectedPlan || contract.contractType?.replace('_', ' ') || contractScope.title} size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }} /></TableCell>
                    <TableCell><Stack direction="row" spacing={1} alignItems="center"><Calendar size={12} color="rgba(255,255,255,0.3)" /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>Active — Continuous</Typography></Stack></TableCell>
                    <TableCell><Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{money(annual)}</Typography></TableCell>
                    <TableCell align="right"><Stack direction="row" justifyContent="flex-end" spacing={1} flexWrap="wrap"><Chip label={needsSignature ? 'SIGNATURE REQUIRED' : (contract.status || 'ACTIVE')} size="small" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha(color, 0.1), color }} />{needsSignature ? <Button disabled={signingId === contract.id} size="small" startIcon={<PenLine size={14} />} onClick={() => handleSignContract(contract)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{signingId === contract.id ? 'Signing...' : 'Sign Contract'}</Button> : <Button size="small" startIcon={<Download size={14} />} onClick={() => openOrDownloadContract(contract)} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{storedContractUrl(contract) ? 'PDF' : 'Download'}</Button>}</Stack></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Paper sx={{ p: 3, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6 }}>
        <Grid container spacing={4} alignItems="center"><Grid item xs={12} md={9}><Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}><Shield size={16} /> SERVICE LEVEL ASSURANCE</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, display: 'block' }}>Owner signature moves the agreement to activation readiness; payment verification still controls dashboard unlock.</Typography></Grid><Grid item xs={12} md={3} sx={{ textAlign: 'right' }}><Button variant="outlined" sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, px: 3, borderRadius: 3 }} startIcon={<MailCheck size={16} />}>Email Enabled</Button></Grid></Grid>
      </Paper>
    </Box>
  );
}
