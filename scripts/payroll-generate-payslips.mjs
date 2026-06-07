import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function money(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function createSimplePdf(lines) {
  const textLines = lines.map((line, index) => {
    const yMove = index === 0 ? '0' : '-18';
    return `${index === 0 ? '' : `${yMove} Td `}(${escapePdfText(line)}) Tj`;
  }).join('\n');

  const stream = `BT
/F1 12 Tf
50 790 Td
${textLines}
ET`;

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object + '\n';
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf);
}

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'bin-group-57c60';
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;
const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : applicationDefault();

initializeApp({ credential, projectId, storageBucket });

const db = getFirestore();
const bucket = getStorage().bucket();

const period = argValue('--period') || currentPeriod();
const dryRun = process.argv.includes('--dry-run');
const limit = Number(argValue('--limit') || 500);

const snap = await db.collection('payroll').where('month', '==', period).limit(limit).get();
const eligible = snap.docs.filter((doc) => {
  const status = String(doc.data().status || '').toLowerCase();
  return ['pending_finance_review', 'initialized', 'pending', 'draft'].includes(status);
});

console.log(`[Payroll] Period ${period}. Found ${snap.size}, eligible ${eligible.length}. Dry run: ${dryRun}`);

for (const docSnap of eligible) {
  const data = docSnap.data();
  const staffId = String(data.staffId || data.uid || data.techId || docSnap.id).trim();
  const displayName = String(data.displayName || data.fullName || staffId);
  const baseSalary = money(data.baseSalary || data.basicSalary);
  const bonus = money(data.bonus || data.overtimeBonus);
  const absenceDeduction = money(data.absenceDeduction || data.absences);
  const grossSalary = baseSalary + bonus;
  const netSalary = grossSalary - absenceDeduction;
  const storagePath = `payslips/${staffId}/${period}.pdf`;

  const pdf = createSimplePdf([
    'BIN GROUP PAYSLIP',
    `Staff: ${displayName}`,
    `Staff ID: ${staffId}`,
    `Pay Period: ${period}`,
    `Base Salary: ${baseSalary.toFixed(2)}`,
    `Bonus: ${bonus.toFixed(2)}`,
    `Absence Deduction: ${absenceDeduction.toFixed(2)}`,
    `Gross Salary: ${grossSalary.toFixed(2)}`,
    `Net Salary: ${netSalary.toFixed(2)}`,
    'Formula: baseSalary + bonus - absenceDeduction',
    'Status: Generated for HR/Finance review',
  ]);

  console.log(`[Payroll] ${docSnap.id}: net=${netSalary.toFixed(2)} path=${storagePath}`);

  if (dryRun) continue;

  await bucket.file(storagePath).save(pdf, {
    contentType: 'application/pdf',
    metadata: {
      cacheControl: 'private, max-age=0, no-transform',
      metadata: {
        staffId,
        period,
        source: 'payroll-generate-payslips',
      },
    },
  });

  await docSnap.ref.set({
    baseSalary,
    bonus,
    absenceDeduction,
    grossSalary,
    netSalary,
    formula: 'baseSalary + bonus - absenceDeduction',
    payslipStoragePath: storagePath,
    status: 'payslip_generated',
    generatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

console.log('[Payroll] Complete.');
