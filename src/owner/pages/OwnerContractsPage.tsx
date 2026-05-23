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
import { collection, db, doc, functions, httpsCallable, onSnapshot, query, type DocumentData, type QuerySnapshot, type Unsubscribe, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type ContractScope = 'FM_ONLY' | 'PM_ONLY' | 'BOTH';
type NoticeState = { type: 'success' | 'error' | 'info'; text: string };

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
const CONTRACT_TERM_MONTHS = 13;

const firstPositiveNumber = (...values: unknown[]) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return 0;
};

const money = (value: unknown, contract?: any) => {
  const numeric = Number(value || 0);
  if (numeric > 0) return `AED ${numeric.toLocaleString()}`;
  const hasSchedule = !!(contract?.commercialSchedule || contract?.paymentSchedule || contract?.commercialScheduleLocked || contract?.paymentScheduleLocked);
  if (hasSchedule) {
    return 'AED 0 — legacy/admin amount missing';
  }
  return 'Legacy record — field missing';
};

const annualValueOf = (contract: any) => firstPositiveNumber(
  contract?.commercialSchedule?.annualContractValue,
  contract?.paymentSchedule?.annualContractValue,
  contract?.annualContractValue,
  contract?.annualValue,
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
    contract?.commercialSchedule?.mobilizationAmount,
    contract?.paymentSchedule?.mobilizationAmount,
    contract?.mobilizationAmount,
    contract?.depositAmount,
    contract?.mobilizationFee,
    contract?.upfrontAmount,
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
    contract?.commercialSchedule?.selectedContractType ||
      contract?.commercialSchedule?.selectedPlan?.name ||
      contract?.paymentSchedule?.selectedContractType ||
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
      covered: ['Tenant coordination and owner reporting', 'Rent/payment follow-up workflow', 'Lease and document coordination support', 'Owner dashboard governance records'],
      notCovered: ['Facility repairs and maintenance labour', 'Materials, spare parts, and replacement assets', 'Capital works or authority fees', 'Emergency technical callouts unless separately approved'],
      icon: Briefcase,
    };
  }
  if (scope === 'BOTH') {
    return {
      title: 'Property Management + Facility Maintenance',
      desc: 'Full property operations with maintenance, preventive scheduling and service governance',
      features: ['PM Core Features', '24/7 Facility Maintenance', 'Preventive Scheduling'],
      covered: ['Property management coordination', 'Facility maintenance ticket handling', 'Preventive maintenance planning', 'Technician/contractor dispatch governance', 'Owner dashboard and property passport records'],
      notCovered: ['Major capital works without separate quotation', 'Authority fines, permits, or government fees', 'Major material replacement not included in the package', 'Owner-requested upgrades outside approved scope'],
      icon: Award,
    };
  }
  return {
    title: 'Maintenance Contract Only',
    desc: 'Facility maintenance, emergency repairs, preventive scheduling and service governance',
    features: ['24/7 Facility Maintenance', 'Emergency Repairs', 'Preventive Scheduling'],
    covered: ['Corrective maintenance request handling', 'Preventive maintenance scheduling', 'Emergency triage according to SLA', 'Before/after evidence where applicable', 'Admin-supervised technician coordination'],
    notCovered: ['Property management, rent collection, or tenant leasing', 'Major capital works without separate quotation', 'Authority fines, permits, or government fees', 'Materials and spare parts unless included in package'],
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

const emailLookupCandidates = (value: unknown) => {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return [];
  const [local, domain] = email.split('@');
  if (!local || !domain) return [email];
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const variants = new Set<string>([email, `${local}@${normalizedDomain}`]);
  if (normalizedDomain === 'gmail.com') {
    variants.add(`${local.split('+')[0].replace(/\./g, '')}@${normalizedDomain}`);
  }
  return Array.from(variants).filter(Boolean);
};

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const asArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const asDate = (...values: any[]) => {
  for (const value of values) {
    if (!value) continue;
    const candidate = value?.toDate?.() || value;
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) return candidate;
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (typeof candidate === 'object' && Number.isFinite(Number(candidate.seconds))) {
      const parsed = new Date(Number(candidate.seconds) * 1000);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
};

const addMonths = (date: Date, months: number) => {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
};

const dateText = (...values: any[]) => {
  const date = asDate(...values);
  if (date) return date.toLocaleString();
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return 'N/A';
};

const termDates = (contract: any) => {
  const start = asDate(contract?.effectiveFrom, contract?.validFrom, contract?.startedAt, contract?.ownerSignature?.signedAt, contract?.ownerSignedAt, contract?.signedAt, contract?.createdAt) || new Date();
  const end = asDate(contract?.effectiveTo, contract?.validTo, contract?.expiresAt, contract?.endDate, contract?.expiryDate) || addMonths(start, Number(contract?.contractTermMonths || CONTRACT_TERM_MONTHS));
  const firstMonthEnd = asDate(contract?.firstMonthWindowEndsAt, contract?.ownerCanRequestPlanChangeUntil, contract?.ownerSignature?.firstMonthWindowEndsAt) || addMonths(start, 1);
  return { start, end, firstMonthEnd };
};

const termSummaryText = (contract: any) => {
  const term = termDates(contract);
  return `${CONTRACT_TERM_MONTHS} months: ${term.start.toLocaleDateString()} → ${term.end.toLocaleDateString()}`;
};

const tableRow = (label: string, value: unknown) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || 'N/A')}</td></tr>`;
const bulletList = (items: unknown[]) => items.filter(Boolean).map((item) => `<li>${escapeHtml(item)}</li>`).join('');

const propertyRowsParallel = (contract: any) => {
  const propertyList = asArray(contract?.properties || contract?.propertyList || contract?.assets || contract?.serviceDetails?.propertiesList);
  if (propertyList.length > 0) {
    return propertyList.map((property, index) => {
      const name = firstText(property?.propertyName, property?.name, property?.title, property?.address, `Asset ${index + 1}`);
      const type = firstText(property?.type, property?.propertyType, property?.sector, contract?.sector, 'Property');
      const units = firstText(property?.units, property?.totalUnits, property?.unitCount, property?.apartments, 'N/A');
      const location = firstText(property?.location, property?.area, property?.emirate, property?.address, contract?.location, 'UAE');
      
      const typeAr = type === 'Property' ? 'عقار' : type;
      const locationAr = location === 'UAE' ? 'الإمارات العربية المتحدة' : location;

      return `<tr>
        <th>Asset ${index + 1} / العقار ${index + 1}</th>
        <td class="en">
          <div><strong>Name:</strong> ${escapeHtml(name)}</div>
          <div><strong>Type:</strong> ${escapeHtml(type)}</div>
          <div><strong>Units:</strong> ${escapeHtml(units)}</div>
          <div><strong>Location:</strong> ${escapeHtml(location)}</div>
        </td>
        <td class="ar" dir="rtl">
          <div><strong>الاسم:</strong> ${escapeHtml(name)}</div>
          <div><strong>النوع:</strong> ${escapeHtml(typeAr)}</div>
          <div><strong>الوحدات:</strong> ${escapeHtml(units)}</div>
          <div><strong>الموقع:</strong> ${escapeHtml(locationAr)}</div>
        </td>
      </tr>`;
    }).join('');
  }

  const assetCount = firstPositiveNumber(contract?.assets, contract?.assetCount, contract?.serviceDetails?.properties, contract?.portfolioSummary?.properties) || 1;
  const totalUnits = firstText(contract?.totalUnits, contract?.serviceDetails?.totalUnits, contract?.portfolioSummary?.totalUnits, 'N/A');
  const name = firstText(contract?.propertyName, contract?.companyProfile?.name, 'Portfolio');
  const type = firstText(contract?.sector, contract?.propertyType, 'Institutional Portfolio');
  const location = firstText(contract?.location, contract?.emirate, 'UAE');

  const typeAr = type === 'Institutional Portfolio' ? 'محفظة مؤسسية' : type;
  const locationAr = location === 'UAE' ? 'الإمارات العربية المتحدة' : location;

  return `<tr>
    <th>Asset 1 / العقار ١</th>
    <td class="en">
      <div><strong>Name:</strong> ${escapeHtml(name)}</div>
      <div><strong>Type:</strong> ${escapeHtml(type)}</div>
      <div><strong>Units:</strong> ${escapeHtml(totalUnits)}</div>
      <div><strong>Location:</strong> ${escapeHtml(location)}</div>
    </td>
    <td class="ar" dir="rtl">
      <div><strong>الاسم:</strong> ${escapeHtml(name)}</div>
      <div><strong>النوع:</strong> ${escapeHtml(typeAr)}</div>
      <div><strong>الوحدات:</strong> ${escapeHtml(totalUnits)}</div>
      <div><strong>الموقع:</strong> ${escapeHtml(locationAr)}</div>
    </td>
  </tr>
  <tr>
    <td colspan="3" class="muted" style="font-size: 11px; color: #6b7280; text-align: center; padding: 10px;">
      Declared asset count: ${escapeHtml(assetCount)}. Detailed asset schedule is subject to admin verification and property passport issuance. / عدد الأصول المعلن: ${escapeHtml(assetCount)}. جدول الأصول التفصيلي يخضع لتحقق المسؤول وإصدار جواز سفر العقار.
    </td>
  </tr>`;
};

const parallelRow = (clause: string, english: string, arabic: string) => `
<tr>
  <th>${escapeHtml(clause)}</th>
  <td class="en">${english}</td>
  <td class="ar" dir="rtl">${arabic}</td>
</tr>
`;

const contractHtml = (contract: any) => {
  const scopeType = normalizeScope(contract);
  const scope = scopeCopy(scopeType);
  const scopeTitleAr = scopeType === 'PM_ONLY' ? 'إدارة العقارات فقط' : (scopeType === 'BOTH' ? 'إدارة العقارات والمرافق معاً' : 'صيانة المرافق فقط');
  
  const annual = contract?.annualContractValue ?? contract?.commercialSchedule?.annualContractValue ?? contract?.paymentSchedule?.annualContractValue ?? annualValueOf(contract) ?? 0;
  const mobilization = contract?.mobilizationAmount ?? contract?.commercialSchedule?.mobilizationAmount ?? contract?.paymentSchedule?.mobilizationAmount ?? mobilizationOf(contract) ?? 0;
  const balance = contract?.remainingBalance ?? contract?.commercialSchedule?.remainingBalance ?? contract?.paymentSchedule?.remainingBalance ?? (annual > 0 && mobilization > 0 ? Math.max(annual - mobilization, 0) : 0);
  const amountReceived = contract?.amountReceived ?? contract?.commercialSchedule?.amountReceived ?? contract?.paymentSchedule?.amountReceived ?? contract?.amount ?? 0;
  
  const annualText = money(annual, contract);
  const mobilizationText = money(mobilization, contract);
  const balanceText = money(balance, contract);
  const amountReceivedText = money(amountReceived, contract);

  const paymentReferenceId = contract?.paymentReferenceId ?? contract?.commercialSchedule?.paymentReferenceId ?? contract?.paymentSchedule?.paymentReferenceId;
  const paymentReferenceIdText = paymentReferenceId ? String(paymentReferenceId).trim() : ((contract?.commercialSchedule || contract?.paymentSchedule) ? 'N/A' : 'Legacy record — field missing');
  
  const approvedAtRaw = contract?.adminApprovedAt ?? contract?.binGroupStamp?.stampedAt ?? contract?.binGroupsApprovedAt ?? contract?.approvedAt ?? contract?.verifiedAt;
  const approvedAt = approvedAtRaw ? dateText(approvedAtRaw) : ((contract?.commercialSchedule || contract?.paymentSchedule) ? 'N/A' : 'Legacy record — field missing');

  const adminStamp = contract?.adminStamp ?? contract?.commercialSchedule?.adminStamp ?? ((contract?.commercialSchedule || contract?.paymentSchedule) ? 'BIN GROUP APPROVED / DIGITAL STAMP' : 'Legacy record — field missing');
  
  const createdAt = dateText(contract?.createdAt, contract?.submittedAt);
  const signedAt = dateText(contract?.ownerSignature?.signedAt, contract?.ownerSignedAt, contract?.signedAt);
  const term = termDates(contract);
  const validFrom = term.start.toLocaleString();
  const validTo = term.end.toLocaleString();
  const firstMonthWindow = term.firstMonthEnd.toLocaleString();
  
  const ownerName = firstText(contract?.ownerName, contract?.companyProfile?.ownerName, contract?.companyProfile?.name, 'Owner / Client');
  const ownerEmail = firstText(contract?.ownerEmail, contract?.companyProfile?.email, 'N/A');
  const ownerUid = firstText(contract?.ownerUid, contract?.ownerId, contract?.createdBy, 'N/A');
  const packageName = firstText(contract?.packageName, contract?.selectedPlan?.name, contract?.serviceDetails?.selectedPlan, scope.title);
  const paymentPlan = contract?.paymentPlan ?? contract?.commercialSchedule?.paymentPlan ?? contract?.paymentSchedule?.paymentPlan ?? contract?.billingCycle ?? contract?.pricing?.paymentPlan;
  const paymentPlanText = paymentPlan ? String(paymentPlan).trim() : ((contract?.commercialSchedule || contract?.paymentSchedule) ? 'N/A' : 'Legacy record — field missing');
  const currency = contract?.currency ?? contract?.commercialSchedule?.currency ?? contract?.paymentSchedule?.currency ?? 'AED';
  const currencyText = currency ? String(currency).trim() : ((contract?.commercialSchedule || contract?.paymentSchedule) ? 'N/A' : 'Legacy record — field missing');

  const selectedAddOns = asArray(contract?.selectedAddOns || contract?.commercialSchedule?.selectedAddOns || contract?.paymentSchedule?.selectedAddOns || contract?.serviceDetails?.selectedAddOns || contract?.addOns || contract?.addons).map((item) => typeof item === 'string' ? item : firstText(item?.name, item?.title, item?.label));
  const customInclusions = asArray(contract?.inclusions || contract?.commercialSchedule?.coveredItems || contract?.scopeItems || contract?.serviceDetails?.inclusions).map((item) => typeof item === 'string' ? item : firstText(item?.name, item?.title, item?.label));
  const inclusions = customInclusions.length ? customInclusions : [
    ...scope.covered,
    ...(selectedAddOns.length ? selectedAddOns.map((item) => `Selected add-on: ${item}`) : []),
  ];
  const exclusions = asArray(contract?.exclusions || contract?.commercialSchedule?.notCoveredItems || contract?.serviceDetails?.exclusions).map((item) => typeof item === 'string' ? item : firstText(item?.name, item?.title, item?.label));
  const finalExclusions = exclusions.length ? exclusions : scope.notCovered;

  const legalExclusionEn = contract?.commercialSchedule?.legalExclusionClause?.en ?? contract?.legalExclusionClause?.en ?? "Anything not expressly listed in the covered items is excluded and requires a separate written quotation and BIN GROUP admin approval before execution.";
  const legalExclusionAr = contract?.commercialSchedule?.legalExclusionClause?.ar ?? contract?.legalExclusionClause?.ar ?? "أي بند غير مذكور صراحة ضمن البنود المشمولة يعتبر مستثنى ويتطلب عرض سعر كتابي منفصل وموافقة إدارية من BIN GROUP قبل التنفيذ.";

  const amountWarning = (annual <= 0 || mobilization <= 0) && !(contract?.commercialSchedule || contract?.paymentSchedule)
    ? '<div class="warning"><strong>Amount pending admin confirmation.</strong> This generated copy uses the current contract record. Admin must confirm the final contract amount, mobilization amount, and payment schedule before final dashboard unlock.</div>'
    : '';

  const section1Rows = [
    parallelRow('Contract Reference / مرجع العقد', contract?.id || contract?.contractId || 'N/A', contract?.id || contract?.contractId || 'N/A'),
    parallelRow('Status / الحالة', contract?.status || 'N/A', contract?.status || 'N/A'),
    parallelRow('Package Selected / الباقة المختارة', packageName, packageName),
    parallelRow('Scope Selected / نطاق العمل', scope.title, scopeTitleAr),
    parallelRow('Contract Term / مدة العقد', `${CONTRACT_TERM_MONTHS} Months`, `${CONTRACT_TERM_MONTHS} شهور`),
    parallelRow('First Month Change Window / فترة التغيير', `Until ${firstMonthWindow}`, `حتى ${firstMonthWindow}`),
    parallelRow('Annual Value / القيمة السنوية', annualText, annualText),
    parallelRow('15% Mobilization / دفعة التعبئة والبدء 15٪', mobilizationText, mobilizationText),
  ].join('');

  const section2Rows = [
    parallelRow('Service Provider / مقدم الخدمة', 'BIN GROUP / BIN Construction & General Maintenance', 'مجموعة بن / بن للمقاولات والصيانة العامة'),
    parallelRow('Owner / Client / المالك / العميل', ownerName, ownerName),
    parallelRow('Owner Email / البريد الإلكتروني للمالك', ownerEmail, ownerEmail),
    parallelRow('Owner UID / Reference / معرف المالك', ownerUid, ownerUid),
    parallelRow('Registered Company / Portfolio / المحفظة العقارية', firstText(contract?.companyProfile?.name, contract?.propertyName, 'Portfolio'), firstText(contract?.companyProfile?.name, contract?.propertyName, 'Portfolio')),
    parallelRow('Trade License / KYC Reference / رخصة تجارية أو مرجع KYC', firstText(contract?.companyProfile?.licenseNumber, contract?.licenseNumber, contract?.kycReference, 'Subject to admin verification'), firstText(contract?.companyProfile?.licenseNumber, contract?.licenseNumber, contract?.kycReference, 'يخضع لتحقق المسؤول')),
  ].join('');

  const section4Rows = [
    parallelRow('Owner Digital Signature Date/Time / تاريخ ووقت توقيع المالك', signedAt, signedAt),
    parallelRow('Contract Starts / بدء العقد', validFrom, validFrom),
    parallelRow('Contract Finishes / انتهاء العقد', validTo, validTo),
    parallelRow('Duration / المدة', `${CONTRACT_TERM_MONTHS} months from digital signature`, `${CONTRACT_TERM_MONTHS} شهراً من التوقيع الرقمي`),
    parallelRow('First Month Cancel / Upgrade Window / فترة الإلغاء أو الترقية', `Until ${firstMonthWindow}`, `حتى ${firstMonthWindow}`),
  ].join('');

  const section5Rows = [
    parallelRow('Annual Contract Value / قيمة العقد السنوية', annualText, annualText),
    parallelRow('15% Mobilization / Activation / دفعة التعبئة والتنشيط 15٪', mobilizationText, mobilizationText),
    parallelRow('Amount Received / المبلغ المستلم', amountReceivedText, amountReceivedText),
    parallelRow('Remaining Contract Balance / رصيد العقد المتبقي', balanceText, balanceText),
    parallelRow('Payment Plan / خطة الدفع', paymentPlanText, paymentPlanText),
    parallelRow('Currency / العملة', currencyText, currencyText),
    parallelRow('Payment Reference ID / معرف مرجع الدفع', paymentReferenceIdText, paymentReferenceIdText),
    parallelRow('Payment Verification / التحقق من الدفع', 'Dashboard unlock requires admin payment verification. Owner signature alone does not unlock the dashboard.', 'يتطلب فتح لوحة التحكم التحقق من الدفع من قِبل المسؤول. توقيع المالك وحده لا يفتح لوحة التحكم.'),
    parallelRow('VAT / Tax Treatment / ضريبة القيمة المضافة', firstText(contract?.vatTreatment, contract?.taxTreatment, 'Subject to UAE VAT and invoice rules where applicable.'), firstText(contract?.vatTreatmentAr, 'يخضع لضريبة القيمة المضافة في دولة الإمارات وقواعد الفواتير المعمول بها.')),
  ].join('');

  const coveredEn = `<div><strong>Package Name:</strong> ${escapeHtml(packageName)}</div>
  <div><strong>Scope:</strong> ${escapeHtml(scope.title)}</div>
  <p><strong>Covered Items:</strong></p>
  <ul>${inclusions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  ${selectedAddOns.length ? `<p><strong>Selected Add-ons:</strong></p><ul>${selectedAddOns.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}`;

  const coveredAr = `<div><strong>اسم الباقة:</strong> ${escapeHtml(packageName)}</div>
  <div><strong>نطاق التغطية:</strong> ${escapeHtml(scopeTitleAr)}</div>
  <p><strong>البنود المشمولة:</strong></p>
  <ul>${inclusions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  ${selectedAddOns.length ? `<p><strong>الإضافات المختارة:</strong></p><ul>${selectedAddOns.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}`;

  const section6Rows = parallelRow('Covered Scope / النطاق المشمول بالاتفاقية', coveredEn, coveredAr);

  const exclusionsEn = `<p><strong>Excluded Items:</strong></p>
  <ul>${finalExclusions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  <p class="clause"><strong>General Exclusion Clause:</strong> ${escapeHtml(legalExclusionEn)}</p>`;

  const exclusionsAr = `<p><strong>البنود المستثناة:</strong></p>
  <ul>${finalExclusions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  <p class="clause" dir="rtl"><strong>بند الاستثناء العام:</strong> ${escapeHtml(legalExclusionAr)}</p>`;

  const section7Rows = parallelRow('Exclusions / المستثنيات والبنود غير المشمولة', exclusionsEn, exclusionsAr);

  const section8Rows = [
    parallelRow('Emergency / safety risk / خطر الطوارئ والسلامة', 
                'Target response within 4 hours after valid ticket creation, subject to access and site conditions.',
                'الاستجابة المستهدفة خلال 4 ساعات بعد إنشاء تذكرة صالحة، وتخضع لشروط الوصول والموقع.'),
    parallelRow('Urgent operational fault / خلل تشغيلي عاجل',
                'Same day / next business day triage depending on severity and resources.',
                'الفرز في نفس اليوم أو يوم العمل التالي حسب الخطورة والموارد المتاحة.'),
    parallelRow('Standard maintenance request / طلب صيانة قياسي',
                'Scheduled under preventive/corrective maintenance calendar.',
                'مجدول تحت تقويم الصيانة الوقائية/التصحيحية.'),
    parallelRow('Owner/admin escalation / التصعيد للمالك/الإدارة',
                'Governed through BIN GROUP dashboard, audit logs, and admin verification workflow.',
                'يخضع للوحة تحكم BIN GROUP وسجلات التدقيق وسير عمل التحقق للمسؤول.')
  ].join('');

  const section9Rows = [
    parallelRow('Good Faith & Fair Dealing / حسن النية والتعامل العادل',
                'The parties declare their commitment to good faith and fair dealing in the performance of their obligations under this agreement in accordance with UAE Civil Code principles.',
                'يقر الطرفان بالتزامهما بمبدأ حسن النية والتعامل العادل في تنفيذ التزاماتهما بموجب هذه الاتفاقية وفقاً لمبادئ قانون المعاملات المدنية لدولة الإمارات العربية المتحدة.'),
    parallelRow('Disclosure Acknowledgement / الإقرار بالإفصاح والشفافية',
                'The owner acknowledges and confirms that all material elements of the service scope, exclusions, pricing structure, and activation rules have been fully disclosed and explained.',
                'يقر المالك ويؤكد بأنه قد تم الإفصاح له وتوضيح جميع العناصر الجوهرية المتعلقة بنطاق الخدمة، والمستثنيات، وهيكل الأسعار، وقواعد التفعيل بشكل كامل.'),
    parallelRow('Electronic Signature / التوقيع الإلكتروني والقبول الرقمي',
                'The parties agree that electronic signatures, digital clicks, and platform acceptances constitute valid, legally binding execution under UAE Electronic Transactions Law.',
                'يوافق الطرفان على أن التوقيعات الإلكترونية، والنقرات الرقمية، والقبول عبر المنصة تشكل تنفيذاً صحيحاً وملزماً قانوناً بموجب قانون المعاملات الإلكترونية الإماراتي.'),
    parallelRow('Admin Verification / التحقق والموافقة الإدارية',
                'Owner digital signature alone does not activate services. Full dashboard unlock and commencement are subject to admin payment verification.',
                'توقيع المالك رقمياً بمفرده لا يفعل الخدمات. يخضع فتح لوحة التحكم بالكامل وبدء الخدمات للتحقق من الدفع من قِبل المسؤول.'),
    parallelRow('Limitation of Liability / تحديد المسؤولية القانونية',
                'Nothing in this agreement shall limit or exclude liability for fraud, intentional breach, gross negligence, or personal injury under applicable UAE laws.',
                'لا يوجد في هذه الاتفاقية ما يحد أو يستثني المسؤولية عن الاحتيال، أو الإخلال المتعمد، أو الخطأ الجسيم، أو الإصابة الشخصية بموجب القوانين السارية في دولة الإمارات.'),
    parallelRow('Liquidated Damages & SLA Credits / التعويضات الاتفاقية ورصيد الخدمة',
                'Any pre-agreed service level credits or liquidated damages are subject to UAE law principles and must reflect actual losses incurred.',
                'تخضع أي أرصدة مستوى خدمة متفق عليها مسبقاً أو تعويضات اتفاقية لمبادئ قانون دولة الإمارات ويجب أن تعكس الخسائر الفعلية المتكبدة.'),
    parallelRow('Language Precedence / لغة العقد والمرجعية',
                'This agreement is bilingual. Arabic text shall control where UAE courts require Arabic for formal proceedings, otherwise the English text is the operational reference.',
                'هذه الاتفاقية ثنائية اللغة. يسري النص العربي ويرجح عندما تتطلب محاكم دولة الإمارات اللغة العربية للإجراءات الرسمية، وخلاف ذلك يكون النص الإنجليزي هو المرجع التشغيلي.'),
    parallelRow('Governing Law & Jurisdiction / القانون الواجب التطبيق والاختصاص القضائي',
                'This agreement is governed by the laws of the United Arab Emirates. UAE courts have jurisdiction, unless BIN GROUP elects a separately signed arbitration agreement.',
                'تخضع هذه الاتفاقية وتفسر وفقاً لقوانين دولة الإمارات العربية المتحدة. وتختص محاكم دولة الإمارات بالفصل في أي نزاع، ما لم تختر مجموعة بن اتفاقية تحكيم منفصلة موقعة حسب الأصول.')
  ].join('');

  const sigStatus = contract?.signatureStatus || (contract?.ownerSigned ? 'OWNER_SIGNED' : 'PENDING');
  const payStatus = firstText(contract?.paymentStatus, contract?.paymentVerified ? 'VERIFIED' : 'PENDING_ADMIN_VERIFICATION');
  const activeId = firstText(contract?.activeContractId, contract?.id, 'N/A');

  const section10Rows = [
    parallelRow('Created / تاريخ الإنشاء', createdAt, createdAt),
    parallelRow('Approved & Stamped / المعتمد والمختوم من الإدارة', approvedAt, approvedAt),
    parallelRow('Owner Signed / موقع من المالك', signedAt, signedAt),
    parallelRow('Signature Status / حالة التوقيع', sigStatus, sigStatus),
    parallelRow('Payment Status / حالة الدفع', payStatus, payStatus),
    parallelRow('Active Contract ID / معرف العقد النشط', activeId, activeId),
  ].join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BIN GROUP Contract ${escapeHtml(contract?.id || '')}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 34px; color: #111827; line-height: 1.48; background: #ffffff; }
    button { float: right; padding: 10px 16px; border-radius: 8px; border: 1px solid #c8a95b; background: #c8a95b; font-weight: 800; cursor: pointer; }
    .header { border-bottom: 4px solid #c8a95b; padding-bottom: 18px; margin-bottom: 24px; }
    .brand { letter-spacing: 4px; color: #9f7e2f; font-weight: 900; font-size: 22px; }
    .title { font-size: 30px; font-weight: 900; margin: 12px 0 0; }
    .subtitle { color: #4b5563; margin-top: 6px; }
    .section { margin-top: 24px; page-break-inside: avoid; }
    .section h2 { font-size: 18px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 12px; }
    .parallel-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .parallel-table th, .parallel-table td { border: 1px solid #e5e7eb; padding: 9px; vertical-align: top; }
    .parallel-table th { width: 18%; background: #f3f4f6; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #374151; text-align: left; }
    .parallel-table td { width: 41%; }
    .en { text-align: left; direction: ltr; }
    .ar { text-align: right; direction: rtl; font-family: Arial, "Tahoma", sans-serif; line-height: 1.8; }
    .warning { background: #fff7ed; border: 1px solid #f59e0b; border-radius: 12px; padding: 14px; margin-top: 14px; }
    .stamp { border: 2px solid #9f7e2f; color: #9f7e2f; font-weight: 900; text-align: center; padding: 12px; border-radius: 999px; letter-spacing: 2px; }
    .muted { color: #6b7280; font-size: 12px; }
    .clause { margin: 8px 0; }
    .sign { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
    .line { border-top: 1px solid #111827; padding-top: 10px; font-size: 12px; color: #374151; }
    .footer { margin-top: 34px; color: #6b7280; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    .legal-note { background: #fefaf0; border-left: 4px solid #c8a95b; padding: 14px; border-radius: 8px; }
    @media print { button { display: none; } body { margin: 22px; } .section { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <button onclick="window.print()">Print / Save as PDF</button>
  <div class="header">
    <div style="display: flex; justify-content: space-between; align-items: baseline;">
      <div class="brand">BIN GROUP / مجموعة بن</div>
      <div style="font-size: 14px; font-weight: bold; color: #9f7e2f;">UAE PORTFOLIO AGREEMENT / اتفاقية محفظة الإمارات</div>
    </div>
    <div class="title">Owner Service Agreement / اتفاقية تقديم خدمات المالك</div>
    <div class="subtitle">Property Management • Facility Maintenance • Digital Governance • UAE Portfolio Care</div>
  </div>

  <div class="section">
    <h2>1. Agreement Summary / ملخص الاتفاقية</h2>
    <table class="parallel-table">
      <thead>
        <tr>
          <th>Clause / بند</th>
          <th>English</th>
          <th dir="rtl">العربية</th>
        </tr>
      </thead>
      <tbody>${section1Rows}</tbody>
    </table>
    ${amountWarning}
  </div>

  <div class="section">
    <h2>2. Parties / الأطراف</h2>
    <table class="parallel-table">
      <thead>
        <tr>
          <th>Clause / بند</th>
          <th>English</th>
          <th dir="rtl">العربية</th>
        </tr>
      </thead>
      <tbody>${section2Rows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>3. Property / Asset Schedule / جدول العقارات والأصول</h2>
    <table class="parallel-table">
      <thead>
        <tr>
          <th>Asset / العقار</th>
          <th>English Details</th>
          <th dir="rtl" style="text-align: right;">تفاصيل العقار بالعربية</th>
        </tr>
      </thead>
      <tbody>${propertyRowsParallel(contract)}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>4. Term and Dates / المدة والتواريخ</h2>
    <table class="parallel-table">
      <thead>
        <tr>
          <th>Clause / بند</th>
          <th>English</th>
          <th dir="rtl">العربية</th>
        </tr>
      </thead>
      <tbody>${section4Rows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>5. Financial Terms / الشروط المالية</h2>
    <table class="parallel-table">
      <thead>
        <tr>
          <th>Clause / بند</th>
          <th>English</th>
          <th dir="rtl">العربية</th>
        </tr>
      </thead>
      <tbody>${section5Rows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>6. Covered Scope / النطاق المشمول</h2>
    <table class="parallel-table">
      <thead>
        <tr>
          <th>Clause / بند</th>
          <th>English</th>
          <th dir="rtl">العربية</th>
        </tr>
      </thead>
      <tbody>${section6Rows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>7. Not Covered / Exclusions / المستثنيات والبنود غير المشمولة</h2>
    <table class="parallel-table">
      <thead>
        <tr>
          <th>Clause / بند</th>
          <th>English</th>
          <th dir="rtl">العربية</th>
        </tr>
      </thead>
      <tbody>${section7Rows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>8. SLA and Operations Governance / اتفاقية مستوى الخدمة وإدارة العمليات</h2>
    <table class="parallel-table">
      <thead>
        <tr>
          <th>Priority / الأولوية</th>
          <th>English</th>
          <th dir="rtl">العربية</th>
        </tr>
      </thead>
      <tbody>${section8Rows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>9. Legal Terms & Digital Evidence / الأحكام القانونية والأدلة الرقمية</h2>
    <table class="parallel-table">
      <thead>
        <tr>
          <th>Clause / بند</th>
          <th>English</th>
          <th dir="rtl">العربية</th>
        </tr>
      </thead>
      <tbody>${section9Rows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>10. Audit Trail and Signature Certificate / مسار التدقيق وشهادة التوقيع</h2>
    <table class="parallel-table">
      <thead>
        <tr>
          <th>Clause / بند</th>
          <th>English</th>
          <th dir="rtl">العربية</th>
        </tr>
      </thead>
      <tbody>${section10Rows}</tbody>
    </table>
  </div>

  <div class="sign">
    <div class="line">
      <strong>Owner Signature / Electronic Acceptance</strong><br />
      <strong>التوقيع الإلكتروني للمالك</strong><br />
      Name / الاسم: ${escapeHtml(ownerName)}<br />
      Date / التاريخ: ${escapeHtml(signedAt)}
    </div>
    <div class="line">
      <strong>BIN GROUP Admin Verification</strong><br />
      <strong>التحقق من مسؤول مجموعة بن</strong><br />
      <div class="stamp" style="margin-top: 10px; margin-bottom: 10px;">${escapeHtml(adminStamp)}</div>
      Date / التاريخ: ${escapeHtml(approvedAt)}
    </div>
  </div>

  <div class="footer">
    Generated by BIN GROUP Owner Portal. Contract term: ${CONTRACT_TERM_MONTHS} months. Contract reference: ${escapeHtml(contract?.id || contract?.contractId || 'N/A')}.
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

  const contractIdFromUrl = useMemo(() => new URLSearchParams(window.location.search).get('contractId'), []);

  useEffect(() => {
    if (!user?.email && !user?.uid) {
      setContracts([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const seen = new Map<string, any>();
    const email = String(user?.email || '').toLowerCase();

    const sortContracts = (a: any, b: any) => {
      const aSignable = isSignable(a);
      const bSignable = isSignable(b);
      if (aSignable && !bSignable) return -1;
      if (!aSignable && bSignable) return 1;

      const aPost = isPostSignature(a);
      const bPost = isPostSignature(b);
      if (aPost && !bPost) return -1;
      if (!aPost && bPost) return 1;

      const aTime = Number(a?.updatedAt?.seconds || a?.createdAt?.seconds || 0);
      const bTime = Number(b?.updatedAt?.seconds || b?.createdAt?.seconds || 0);
      return bTime - aTime;
    };

    const apply = (snap: QuerySnapshot<DocumentData>) => {
      snap.docs.forEach((doc) => seen.set(doc.id, { id: doc.id, ...doc.data() }));
      setContracts(Array.from(seen.values()).sort(sortContracts));
      setLoading(false);
    };

    const fail = (err: any) => {
      console.error('Owner contracts query failed:', err);
      setNotice({ type: 'error', text: err?.message || 'Unable to load contracts.' });
      setLoading(false);
    };

    const unsubs: Unsubscribe[] = [];
    const profileContractIds = [
      (user as any)?.pendingContractId,
      (user as any)?.latestActivationContractId,
      (user as any)?.activeContractId,
      (user as any)?.contractId,
      (user as any)?.latestContractId,
    ].map((value) => String(value || '').trim()).filter(Boolean);

    if (user?.uid) {
      unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('ownerUid', '==', user.uid)), apply, fail));
      unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('ownerId', '==', user.uid)), apply, fail));
    }
    if (email) {
      emailLookupCandidates(user?.email || email).forEach((candidateEmail) => {
        unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('ownerEmail', '==', candidateEmail)), apply, fail));
        unsubs.push(onSnapshot(query(collection(db, 'contracts'), where('emailDelivery.recipient', '==', candidateEmail)), apply, fail));
      });
    }

    const directContractIds = Array.from(new Set([
      contractIdFromUrl,
      ...profileContractIds,
    ].map((value) => String(value || '').trim()).filter(Boolean)));

    directContractIds.forEach((directContractId) => {
      unsubs.push(
        onSnapshot(
          doc(db, 'contracts', directContractId),
          (docSnap) => {
            if (docSnap.exists()) {
              seen.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
              setContracts(Array.from(seen.values()).sort(sortContracts));
            }
            setLoading(false);
          },
          (err) => {
            console.error('Direct contract listener failed:', err);
            setLoading(false);
          }
        )
      );
    });

    setSignatureName(user?.displayName || user?.email || '');
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [user?.displayName, user?.email, user?.uid, contractIdFromUrl]);

  const primaryContract = useMemo(() => contracts.find(isSignable) || contracts.find(isPostSignature) || contracts[0], [contracts]);
  const selectedScope = normalizeScope(primaryContract);
  const selectedScopeCopy = scopeCopy(selectedScope);
  const ScopeIcon = selectedScopeCopy.icon;
  const hasSignatureRequired = useMemo(() => contracts.some(isSignable), [contracts]);

  const urlContractNotFound = useMemo(() => {
    if (!contractIdFromUrl) return false;
    return !contracts.some((c) => c.id === contractIdFromUrl);
  }, [contractIdFromUrl, contracts]);

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
      const data = result.data as { status?: string; idempotent?: boolean; termSummary?: any };
      const termMessage = data?.termSummary?.validToIso ? ` Contract valid until ${new Date(data.termSummary.validToIso).toLocaleDateString()}.` : '';
      setNotice({ type: 'success', text: data?.idempotent ? `Contract is already signed and ready for activation/payment verification.${termMessage}` : `Contract signed successfully. Status: ${data?.status || 'READY_FOR_ACTIVATION'}.${termMessage}` });
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

      {urlContractNotFound && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Contract link not found or not connected to this owner account. Contact BIN GROUP Admin.
        </Alert>
      )}

      {notice && <Alert severity={notice.type} sx={{ mb: 3 }}>{notice.text}</Alert>}

      {hasSignatureRequired && primaryContract && (
        <Paper sx={{ p: 4, mb: 5, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.28)}`, borderRadius: 5 }}>
          <Stack spacing={3}>
            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', display: 'flex', gap: 1, alignItems: 'center' }}><PenLine color={binThemeTokens.gold} /> Contract Signature Required</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)' }}>Type your full legal name and sign. The backend verifies ownership and records the signature. Dashboard unlock still requires payment verification.</Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>Contract Reference</Typography>
                <Typography variant="body1" sx={{ color: '#FFF', fontWeight: 900 }}>{primaryContract.id || primaryContract.contractId || 'N/A'}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>Annual Value</Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{money(annualValueOf(primaryContract), primaryContract)}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>15% Mobilization</Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{money(mobilizationOf(primaryContract), primaryContract)}</Typography>
              </Grid>
            </Grid>

            <TextField fullWidth label="Full legal name for e-signature" value={signatureName} onChange={(event) => setSignatureName(event.target.value)} InputLabelProps={{ style: { color: 'rgba(255,255,255,0.5)' } }} InputProps={{ style: { color: '#FFF' } }} />
            
            <Box>
              <Button 
                variant="contained" 
                disabled={signingId === primaryContract.id} 
                onClick={() => handleSignContract(primaryContract)} 
                sx={{ 
                  bgcolor: binThemeTokens.gold, 
                  color: '#000', 
                  fontWeight: 950, 
                  px: 4, 
                  py: 1.5, 
                  borderRadius: 3,
                  '&:hover': {
                    bgcolor: alpha(binThemeTokens.gold, 0.8)
                  }
                }}
              >
                {signingId === primaryContract.id ? 'Signing...' : 'Review & Sign Contract'}
              </Button>
            </Box>
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
                    <TableCell><Stack direction="row" spacing={1} alignItems="center"><Calendar size={12} color="rgba(255,255,255,0.3)" /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>{termSummaryText(contract)}</Typography></Stack></TableCell>
                    <TableCell><Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{money(annual, contract)}</Typography></TableCell>
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
