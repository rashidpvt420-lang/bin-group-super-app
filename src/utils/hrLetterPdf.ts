import { jsPDF } from 'jspdf';
import { registerArabicFont } from './arabicPdfFont';
import { writeLTR, writeRTL, wrappedLTR, savePdfMobileSafe } from './bilingualContractPdf';
import { COMPANY_DISPLAY_NAME, COMPANY_IDENTITY, COMPANY_REGISTRATION_LINE_EN, COMPANY_TRADING_AS_EN } from '../lib/companyIdentity';

export type HrLetterIssuer = {
  hrName: string;
  hrDesignation: string;
};

export type HrLetterStaffInfo = {
  fullName: string;
  position: string;
  staffCode?: string;
  joiningDate: Date;
};

const DEFAULT_COMPANY_NAME = COMPANY_DISPLAY_NAME;
const COMPANY_REGISTRATION_LINE = COMPANY_REGISTRATION_LINE_EN;

export const HR_LETTER_NO_LIABILITY =
  'This letter is issued at the employee\'s request based on records held on the date of issue. It does not constitute a guarantee, surety or financial undertaking of any kind, and the company accepts no liability towards any third party arising from its issue or use.';

export const HR_LETTER_DISCLAIMER =
  'Generated via BIN-GROUPS Super App HR module from staff profile data on file. Verify staff details, employment dates, and signatory before issuing to banks, embassies, or government authorities.';

const formatDate = (value: Date) => value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function renderLetterShell(doc: jsPDF, titleEn: string, titleAr: string, referenceNumber: string, issueDate: Date, companyName: string) {
  registerArabicFont(doc);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  writeLTR(doc, companyName, 105, 18, { align: 'center' });
  doc.setFontSize(13);
  writeLTR(doc, titleEn, 105, 28, { align: 'center' });
  writeRTL(doc, titleAr, 195, 36);
  doc.setDrawColor(40);
  doc.line(15, 42, 195, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  writeLTR(doc, `Reference: ${referenceNumber}`, 15, 50);
  writeLTR(doc, `Date: ${formatDate(issueDate)}`, 15, 56);
  doc.setFontSize(8);
  const next = wrappedLTR(doc, COMPANY_TRADING_AS_EN, 15, 61, 180, 3.5);
  wrappedLTR(doc, COMPANY_REGISTRATION_LINE, 15, next + 0.5, 180, 3.5);
  doc.setFontSize(10);
  return 82;
}

function renderLetterFooter(doc: jsPDF, issuer: HrLetterIssuer) {
  doc.setDrawColor(180);
  doc.line(15, 246, 90, 246);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  writeLTR(doc, issuer.hrName || COMPANY_IDENTITY.authorisedSignatoryEn, 15, 252);
  writeLTR(doc, issuer.hrDesignation || COMPANY_IDENTITY.authorisedSignatoryTitleEn, 15, 258);
  writeLTR(doc, 'Company stamp:', 120, 252);
  doc.setFontSize(8);
  wrappedLTR(doc, HR_LETTER_NO_LIABILITY, 15, 266, 180, 4);
  wrappedLTR(doc, HR_LETTER_DISCLAIMER, 15, 278, 180, 4);
}

export type NocLetterInput = {
  staff: HrLetterStaffInfo;
  issuer: HrLetterIssuer;
  purpose: string;
  referenceNumber: string;
  issueDate?: Date;
  companyName?: string;
};

export function buildNocLetterDoc(input: NocLetterInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const companyName = input.companyName || DEFAULT_COMPANY_NAME;
  const issueDate = input.issueDate || new Date();
  doc.setProperties({ title: `NOC Letter - ${input.staff.fullName}`, subject: 'No Objection Certificate', author: companyName, creator: 'BIN-GROUPS Super App' });

  let y = renderLetterShell(doc, 'NO OBJECTION CERTIFICATE', 'شهادة عدم ممانعة', input.referenceNumber, issueDate, companyName);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  writeLTR(doc, 'TO WHOM IT MAY CONCERN', 15, y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const body = `This is to certify that ${input.staff.fullName}${input.staff.staffCode ? ` (Staff Code: ${input.staff.staffCode})` : ''}, holding the position of ${input.staff.position}, has been employed with ${companyName} since ${formatDate(input.staff.joiningDate)}.\n\n${companyName} has no objection to ${input.purpose}.\n\nThis letter is issued at the employee's request and may be used for the stated purpose only. It does not alter the terms of the employee's employment contract, and remains subject to UAE law and the requirements of the competent authorities.`;
  y = wrappedLTR(doc, body, 15, y, 180, 6);

  renderLetterFooter(doc, input.issuer);
  return { doc, filename: `NOC_Letter_${input.referenceNumber}.pdf` };
}

export function generateNocLetterPdf(input: NocLetterInput) {
  const { doc, filename } = buildNocLetterDoc(input);
  return savePdfMobileSafe(doc, filename);
}

export type ExperienceLetterInput = {
  staff: HrLetterStaffInfo;
  issuer: HrLetterIssuer;
  lastWorkingDate?: Date | null;
  /** Last monthly wage (AED); Art. 13(11) lists it as part of the certificate of experience. */
  lastWageAed?: number | null;
  /** Neutral reason for end of contract (e.g. 'expiry of contract term', 'resignation'). Never include anything that may harm the worker's reputation (Art. 13(11)). */
  separationReason?: string | null;
  referenceNumber: string;
  issueDate?: Date;
  companyName?: string;
};

export function buildExperienceLetterDoc(input: ExperienceLetterInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const companyName = input.companyName || DEFAULT_COMPANY_NAME;
  const issueDate = input.issueDate || new Date();
  doc.setProperties({ title: `Experience Letter - ${input.staff.fullName}`, subject: 'Employment Experience Letter', author: companyName, creator: 'BIN-GROUPS Super App' });

  let y = renderLetterShell(doc, 'EXPERIENCE LETTER', 'شهادة خبرة', input.referenceNumber, issueDate, companyName);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  writeLTR(doc, 'TO WHOM IT MAY CONCERN', 15, y);
  y += 12;

  const period = input.lastWorkingDate
    ? `from ${formatDate(input.staff.joiningDate)} to ${formatDate(input.lastWorkingDate)}`
    : `since ${formatDate(input.staff.joiningDate)} and remains a current employee`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const verb = input.lastWorkingDate ? 'worked' : 'has worked';
  const wageLine = typeof input.lastWageAed === 'number' && input.lastWageAed > 0 ? `\n\nLast monthly wage: AED ${input.lastWageAed.toLocaleString('en-GB')}.` : '';
  const reasonLine = input.lastWorkingDate && input.separationReason ? `\n\nReason for end of employment: ${input.separationReason}.` : '';
  // Federal Decree-Law No. 33 of 2021, Art. 13(11): free certificate stating start/end dates, service
  // term, job title, last wage and reason for termination, with nothing that may harm the worker's
  // reputation. We state facts only and do not auto-certify conduct or performance.
  const body = `This is to certify that ${input.staff.fullName}${input.staff.staffCode ? ` (Staff Code: ${input.staff.staffCode})` : ''} ${verb} with ${companyName} as ${input.staff.position} ${period}.${wageLine}${reasonLine}\n\nThis certificate is issued free of charge at the employee's request and may be used for any lawful purpose.`;
  y = wrappedLTR(doc, body, 15, y, 180, 6);

  renderLetterFooter(doc, input.issuer);
  return { doc, filename: `Experience_Letter_${input.referenceNumber}.pdf` };
}

export function generateExperienceLetterPdf(input: ExperienceLetterInput) {
  const { doc, filename } = buildExperienceLetterDoc(input);
  return savePdfMobileSafe(doc, filename);
}

export type SalaryCertificateInput = {
  staff: HrLetterStaffInfo;
  issuer: HrLetterIssuer;
  basicSalaryAed: number;
  grossSalaryAed: number;
  purpose: string;
  referenceNumber: string;
  issueDate?: Date;
  companyName?: string;
};

export function buildSalaryCertificateDoc(input: SalaryCertificateInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const companyName = input.companyName || DEFAULT_COMPANY_NAME;
  const issueDate = input.issueDate || new Date();
  doc.setProperties({ title: `Salary Certificate - ${input.staff.fullName}`, subject: 'Salary Certificate', author: companyName, creator: 'BIN-GROUPS Super App' });

  let y = renderLetterShell(doc, 'SALARY CERTIFICATE', 'شهادة راتب', input.referenceNumber, issueDate, companyName);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  writeLTR(doc, 'TO WHOM IT MAY CONCERN', 15, y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const intro = `This is to certify that ${input.staff.fullName}${input.staff.staffCode ? ` (Staff Code: ${input.staff.staffCode})` : ''} has been employed with ${companyName} as ${input.staff.position} since ${formatDate(input.staff.joiningDate)}, and draws the following monthly salary:`;
  y = wrappedLTR(doc, intro, 15, y, 180, 6) + 6;

  doc.setFont('helvetica', 'bold');
  writeLTR(doc, `Basic Salary: AED ${input.basicSalaryAed.toLocaleString('en-GB')}`, 20, y);
  y += 7;
  writeLTR(doc, `Gross Salary: AED ${input.grossSalaryAed.toLocaleString('en-GB')}`, 20, y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  y = wrappedLTR(doc, `This certificate is issued at the employee's request for the purpose of: ${input.purpose}.`, 15, y, 180, 6);

  renderLetterFooter(doc, input.issuer);
  return { doc, filename: `Salary_Certificate_${input.referenceNumber}.pdf` };
}

export function generateSalaryCertificatePdf(input: SalaryCertificateInput) {
  const { doc, filename } = buildSalaryCertificateDoc(input);
  return savePdfMobileSafe(doc, filename);
}
