import { jsPDF } from 'jspdf';
import { registerArabicFont } from './arabicPdfFont';
import { writeLTR, writeRTL, wrappedLTR, savePdfMobileSafe } from './bilingualContractPdf';

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

const DEFAULT_COMPANY_NAME = 'BIN GROUP PROPERTY MANAGEMENT LLC';

export const HR_LETTER_DISCLAIMER =
  'Generated via BIN GROUP Super App HR module from staff profile data on file. Verify staff details, employment dates, and signatory before issuing to banks, embassies, or government authorities.';

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
  return 72;
}

function renderLetterFooter(doc: jsPDF, issuer: HrLetterIssuer) {
  doc.setDrawColor(180);
  doc.line(15, 246, 90, 246);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  writeLTR(doc, issuer.hrName || 'HR Department', 15, 252);
  writeLTR(doc, issuer.hrDesignation || 'Human Resources', 15, 258);
  doc.setFontSize(8);
  wrappedLTR(doc, HR_LETTER_DISCLAIMER, 15, 275, 180, 4);
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
  doc.setProperties({ title: `NOC Letter - ${input.staff.fullName}`, subject: 'No Objection Certificate', author: companyName, creator: 'BIN GROUP Super App' });

  let y = renderLetterShell(doc, 'NO OBJECTION CERTIFICATE', 'شهادة عدم انتساب', input.referenceNumber, issueDate, companyName);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  writeLTR(doc, 'TO WHOM IT MAY CONCERN', 15, y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const body = `This is to certify that ${input.staff.fullName}${input.staff.staffCode ? ` (Staff Code: ${input.staff.staffCode})` : ''}, holding the position of ${input.staff.position}, has been employed with ${companyName} since ${formatDate(input.staff.joiningDate)}.\n\n${companyName} has no objection to ${input.purpose}.\n\nThis letter is issued upon the employee's request and may be used for the stated purpose only.`;
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
  referenceNumber: string;
  issueDate?: Date;
  companyName?: string;
};

export function buildExperienceLetterDoc(input: ExperienceLetterInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const companyName = input.companyName || DEFAULT_COMPANY_NAME;
  const issueDate = input.issueDate || new Date();
  doc.setProperties({ title: `Experience Letter - ${input.staff.fullName}`, subject: 'Employment Experience Letter', author: companyName, creator: 'BIN GROUP Super App' });

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
  const body = `This is to certify that ${input.staff.fullName}${input.staff.staffCode ? ` (Staff Code: ${input.staff.staffCode})` : ''} worked with ${companyName} as ${input.staff.position} ${period}.\n\nDuring this period, the employee's conduct and performance were satisfactory.\n\nThis letter is issued upon the employee's request and may be used for whatever lawful purpose it may serve.`;
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
  doc.setProperties({ title: `Salary Certificate - ${input.staff.fullName}`, subject: 'Salary Certificate', author: companyName, creator: 'BIN GROUP Super App' });

  let y = renderLetterShell(doc, 'SALARY CERTIFICATE', 'شهادة راتب', input.referenceNumber, issueDate, companyName);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  writeLTR(doc, 'TO WHOM IT MAY CONCERN', 15, y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const intro = `This is to certify that ${input.staff.fullName}${input.staff.staffCode ? ` (Staff Code: ${input.staff.staffCode})` : ''} is employed with ${companyName} as ${input.staff.position} since ${formatDate(input.staff.joiningDate)}, drawing the following monthly salary:`;
  y = wrappedLTR(doc, intro, 15, y, 180, 6) + 6;

  doc.setFont('helvetica', 'bold');
  writeLTR(doc, `Basic Salary: AED ${input.basicSalaryAed.toLocaleString()}`, 20, y);
  y += 7;
  writeLTR(doc, `Gross Salary: AED ${input.grossSalaryAed.toLocaleString()}`, 20, y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  y = wrappedLTR(doc, `This certificate is issued for ${input.purpose} purposes upon the employee's request.`, 15, y, 180, 6);

  renderLetterFooter(doc, input.issuer);
  return { doc, filename: `Salary_Certificate_${input.referenceNumber}.pdf` };
}

export function generateSalaryCertificatePdf(input: SalaryCertificateInput) {
  const { doc, filename } = buildSalaryCertificateDoc(input);
  return savePdfMobileSafe(doc, filename);
}
